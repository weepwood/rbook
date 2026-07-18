create or replace function public.record_content_event(
  p_note_id uuid,
  p_event_type text,
  p_session_id text default null,
  p_dwell_ms integer default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_event_type not in (
    'impression','open','dwell','like','favorite','comment','share','follow_author'
  ) then
    raise exception 'invalid_event_type';
  end if;

  if not exists (
    select 1 from public.notes
    where id = p_note_id and status = 'published' and is_hidden = false
  ) then
    raise exception 'note_not_available';
  end if;

  insert into public.content_events(user_id, session_id, note_id, event_type, dwell_ms)
  values (
    auth.uid(),
    nullif(left(coalesce(p_session_id, ''), 120), ''),
    p_note_id,
    p_event_type,
    case
      when p_dwell_ms is null then null
      else greatest(0, least(p_dwell_ms, 1800000))
    end
  );
end;
$$;

create or replace function public.get_personalized_note_ids(
  p_limit integer default 40,
  p_offset integer default 0,
  p_mode text default 'for_you'
)
returns table(note_id uuid, score double precision, reason text)
language sql
stable
security invoker
set search_path = ''
as $$
with viewer as (
  select auth.uid() as id
),
engagement as (
  select
    n.id,
    (select count(*) from public.likes l where l.note_id = n.id) likes,
    (select count(*) from public.favorites f where f.note_id = n.id) favorites,
    (
      select count(*) from public.comments c
      where c.note_id = n.id and c.deleted_at is null and c.is_hidden = false
    ) comments
  from public.notes n
),
ranked as (
  select
    n.id,
    case
      when p_mode = 'following' then
        case when fol.following_id is not null then 8.0 else -100.0 end
      when p_mode = 'latest' then 0.0
      else coalesce(pref.tag_score, 0)
        + case when fol.following_id is not null then 3.5 else 0 end
    end
    + ln(
      1
      + e.likes * 1.5
      + e.favorites * 2.5
      + e.comments * 2.0
      + greatest(n.view_count, 0) * 0.03
    )
    + greatest(
      0,
      2.5 - extract(epoch from (now() - n.created_at)) / 86400 / 12
    )
    + (
      mod(
        abs(hashtextextended(
          n.id::text || coalesce((select id::text from viewer), 'guest'),
          0
        )),
        1000
      )::double precision / 1000.0
    ) * 0.35
    - case when n.author_id = (select id from viewer) then 1.5 else 0 end
      as final_score,
    case
      when fol.following_id is not null then '关注作者'
      when coalesce(pref.tag_score, 0) > 0.5 then '兴趣匹配'
      when e.likes + e.favorites + e.comments > 5 then '社区热门'
      else '新鲜内容'
    end as why,
    row_number() over (
      partition by n.author_id
      order by n.created_at desc
    ) author_position
  from public.notes n
  join engagement e on e.id = n.id
  left join public.follows fol
    on fol.follower_id = (select id from viewer)
    and fol.following_id = n.author_id
  left join lateral (
    select sum(p.score) tag_score
    from public.user_tag_preferences p
    where p.user_id = (select id from viewer)
      and p.tag = any(n.tags)
  ) pref on true
  where n.status = 'published' and n.is_hidden = false
)
select
  id,
  final_score - greatest(0, author_position - 2) * 1.25,
  why
from ranked
where final_score > -50
order by
  final_score - greatest(0, author_position - 2) * 1.25 desc,
  id
limit greatest(1, least(p_limit, 100))
offset greatest(0, p_offset);
$$;

create or replace function public.get_related_note_ids(
  p_note_id uuid,
  p_limit integer default 8
)
returns table(note_id uuid, score double precision)
language sql
stable
security invoker
set search_path = ''
as $$
with source as (
  select id, author_id, tags
  from public.notes
  where id = p_note_id
),
scored as (
  select
    n.id,
    coalesce((
      select count(*) from unnest(n.tags) t where t = any(s.tags)
    ), 0) * 4.0
    + case when n.author_id = s.author_id then 1.5 else 0 end
    + ln(
      1
      + (select count(*) from public.likes l where l.note_id = n.id)
      + (select count(*) from public.favorites f where f.note_id = n.id) * 2
    )
    + greatest(
      0,
      1.5 - extract(epoch from (now() - n.created_at)) / 86400 / 30
    ) as score
  from public.notes n
  cross join source s
  where n.id <> s.id
    and n.status = 'published'
    and n.is_hidden = false
)
select id, score
from scored
order by score desc, id
limit greatest(1, least(p_limit, 20));
$$;

grant execute on function public.record_content_event(uuid, text, text, integer)
  to anon, authenticated;
grant execute on function public.get_personalized_note_ids(integer, integer, text)
  to anon, authenticated;
grant execute on function public.get_related_note_ids(uuid, integer)
  to anon, authenticated;