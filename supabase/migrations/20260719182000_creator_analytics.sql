-- RBook Issue #3: creator analytics and traffic attribution.

alter table public.content_events
  add column if not exists source text not null default 'other';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.content_events'::regclass
      and conname = 'content_events_source_check'
  ) then
    alter table public.content_events
      add constraint content_events_source_check
      check (source in ('recommendation', 'following', 'latest', 'search', 'profile', 'related', 'explore', 'direct', 'other'));
  end if;
end $$;

create index if not exists content_events_source_created_idx
  on public.content_events (source, created_at desc);

drop function if exists public.record_content_event(uuid, text, text, integer);

create function public.record_content_event(
  p_note_id uuid,
  p_event_type text,
  p_session_id text default null,
  p_dwell_ms integer default null,
  p_source text default 'other'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_event_type not in ('impression','open','dwell','like','favorite','comment','share','follow_author') then
    raise exception 'invalid_event_type';
  end if;

  if p_source not in ('recommendation', 'following', 'latest', 'search', 'profile', 'related', 'explore', 'direct', 'other') then
    raise exception 'invalid_event_source';
  end if;

  if not exists (
    select 1
    from public.notes
    where id = p_note_id
      and status = 'published'
      and is_hidden = false
  ) then
    raise exception 'note_not_available';
  end if;

  insert into public.content_events(user_id, session_id, note_id, event_type, dwell_ms, source)
  values (
    auth.uid(),
    nullif(left(coalesce(p_session_id, ''), 120), ''),
    p_note_id,
    p_event_type,
    case when p_dwell_ms is null then null else greatest(0, least(p_dwell_ms, 1800000)) end,
    p_source
  );
end;
$$;

revoke all on function public.record_content_event(uuid, text, text, integer, text) from public;
grant execute on function public.record_content_event(uuid, text, text, integer, text) to anon, authenticated;

create or replace function public.creator_analytics_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_author_id uuid := auth.uid();
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_period_end timestamptz := now();
  v_period_start timestamptz;
  v_previous_start timestamptz;
  v_result jsonb;
begin
  if v_author_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  v_period_start := date_trunc('day', v_period_end) - make_interval(days => v_days - 1);
  v_previous_start := v_period_start - make_interval(days => v_days);

  with author_notes as (
    select n.id, n.title, n.cover_url, n.tags, n.status, n.published_at, n.created_at
    from public.notes n
    where n.author_id = v_author_id
  ),
  current_events as (
    select e.*
    from public.content_events e
    join author_notes n on n.id = e.note_id
    where e.created_at >= v_period_start
      and e.created_at <= v_period_end
  ),
  previous_events as (
    select e.*
    from public.content_events e
    join author_notes n on n.id = e.note_id
    where e.created_at >= v_previous_start
      and e.created_at < v_period_start
  ),
  current_metric_values as (
    select
      count(*) filter (where event_type = 'impression')::bigint as impressions,
      count(*) filter (where event_type = 'open')::bigint as views,
      count(*) filter (where event_type = 'like')::bigint as likes,
      count(*) filter (where event_type = 'favorite')::bigint as favorites,
      count(*) filter (where event_type = 'comment')::bigint as comments,
      count(*) filter (where event_type = 'share')::bigint as shares,
      coalesce(round(avg(dwell_ms) filter (where event_type = 'dwell')), 0)::bigint as avg_dwell_ms
    from current_events
  ),
  previous_metric_values as (
    select
      count(*) filter (where event_type = 'impression')::bigint as impressions,
      count(*) filter (where event_type = 'open')::bigint as views,
      count(*) filter (where event_type = 'like')::bigint as likes,
      count(*) filter (where event_type = 'favorite')::bigint as favorites,
      count(*) filter (where event_type = 'comment')::bigint as comments,
      count(*) filter (where event_type = 'share')::bigint as shares,
      coalesce(round(avg(dwell_ms) filter (where event_type = 'dwell')), 0)::bigint as avg_dwell_ms
    from previous_events
  ),
  current_followers as (
    select count(*)::bigint as value
    from public.follows
    where following_id = v_author_id
      and created_at >= v_period_start
      and created_at <= v_period_end
  ),
  previous_followers as (
    select count(*)::bigint as value
    from public.follows
    where following_id = v_author_id
      and created_at >= v_previous_start
      and created_at < v_period_start
  ),
  current_summary as (
    select
      m.*,
      f.value as followers,
      round(
        ((m.likes + m.favorites + m.comments + m.shares)::numeric * 100)
        / greatest(m.impressions, m.views, 1),
        2
      )::double precision as engagement_rate
    from current_metric_values m
    cross join current_followers f
  ),
  previous_summary as (
    select
      m.*,
      f.value as followers,
      round(
        ((m.likes + m.favorites + m.comments + m.shares)::numeric * 100)
        / greatest(m.impressions, m.views, 1),
        2
      )::double precision as engagement_rate
    from previous_metric_values m
    cross join previous_followers f
  ),
  day_series as (
    select generate_series(
      v_period_start::date,
      v_period_end::date,
      interval '1 day'
    )::date as day
  ),
  daily_values as (
    select
      d.day,
      count(e.id) filter (where e.event_type = 'impression')::bigint as impressions,
      count(e.id) filter (where e.event_type = 'open')::bigint as views,
      count(e.id) filter (where e.event_type in ('like', 'favorite', 'comment', 'share'))::bigint as interactions,
      (
        select count(*)::bigint
        from public.follows f
        where f.following_id = v_author_id
          and f.created_at >= d.day::timestamptz
          and f.created_at < (d.day + 1)::timestamptz
      ) as followers
    from day_series d
    left join current_events e
      on e.created_at >= d.day::timestamptz
      and e.created_at < (d.day + 1)::timestamptz
    group by d.day
    order by d.day
  ),
  source_values as (
    select source, count(*)::bigint as count
    from current_events
    where event_type in ('impression', 'open')
    group by source
    order by count desc, source
  ),
  tag_values as (
    select
      tag,
      count(e.id) filter (where e.event_type = 'open')::bigint as views,
      count(e.id) filter (where e.event_type in ('like', 'favorite', 'comment', 'share'))::bigint as interactions
    from author_notes n
    cross join lateral unnest(coalesce(n.tags, '{}'::text[])) as tag
    left join current_events e on e.note_id = n.id
    where n.status = 'published'
      and tag <> ''
    group by tag
    order by interactions desc, views desc, tag
    limit 12
  ),
  note_values as (
    select
      n.id as note_id,
      n.title,
      n.cover_url,
      coalesce(n.published_at, n.created_at) as published_at,
      count(e.id) filter (where e.event_type = 'impression')::bigint as impressions,
      count(e.id) filter (where e.event_type = 'open')::bigint as views,
      count(e.id) filter (where e.event_type = 'like')::bigint as likes,
      count(e.id) filter (where e.event_type = 'favorite')::bigint as favorites,
      count(e.id) filter (where e.event_type = 'comment')::bigint as comments,
      count(e.id) filter (where e.event_type = 'share')::bigint as shares,
      coalesce(round(avg(e.dwell_ms) filter (where e.event_type = 'dwell')), 0)::bigint as avg_dwell_ms,
      round(
        (
          count(e.id) filter (where e.event_type in ('like', 'favorite', 'comment', 'share'))::numeric * 100
        ) / greatest(
          count(e.id) filter (where e.event_type = 'impression'),
          count(e.id) filter (where e.event_type = 'open'),
          1
        ),
        2
      )::double precision as engagement_rate
    from author_notes n
    left join current_events e on e.note_id = n.id
    where n.status = 'published'
    group by n.id, n.title, n.cover_url, n.published_at, n.created_at
    order by engagement_rate desc, views desc, published_at desc
    limit 50
  )
  select jsonb_build_object(
    'period_days', v_days,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'summary', (select to_jsonb(s) from current_summary s),
    'previous', (select to_jsonb(s) from previous_summary s),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.day,
        'impressions', d.impressions,
        'views', d.views,
        'interactions', d.interactions,
        'followers', d.followers
      ) order by d.day)
      from daily_values d
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', s.source, 'count', s.count) order by s.count desc, s.source)
      from source_values s
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object('tag', t.tag, 'views', t.views, 'interactions', t.interactions) order by t.interactions desc, t.views desc, t.tag)
      from tag_values t
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.engagement_rate desc, n.views desc, n.published_at desc)
      from note_values n
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.creator_analytics_summary(integer) from public;
grant execute on function public.creator_analytics_summary(integer) to authenticated;

comment on function public.creator_analytics_summary(integer) is
  'Returns private creator performance analytics for the current authenticated author.';
