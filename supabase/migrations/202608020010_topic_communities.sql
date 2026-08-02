create table if not exists public.topic_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null check (char_length(btrim(topic)) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (user_id, topic)
);

create unique index if not exists topic_follows_user_topic_lower_idx
  on public.topic_follows (user_id, lower(topic));
create index if not exists topic_follows_topic_lower_idx
  on public.topic_follows (lower(topic), created_at desc);

alter table public.topic_follows enable row level security;

drop policy if exists topic_follows_owner_read on public.topic_follows;
create policy topic_follows_owner_read
  on public.topic_follows for select
  using (user_id = (select auth.uid()));

drop policy if exists topic_follows_owner_insert on public.topic_follows;
create policy topic_follows_owner_insert
  on public.topic_follows for insert
  with check (user_id = (select auth.uid()) and private.is_enabled_user());

drop policy if exists topic_follows_owner_delete on public.topic_follows;
create policy topic_follows_owner_delete
  on public.topic_follows for delete
  using (user_id = (select auth.uid()) and private.is_enabled_user());

create or replace function public.get_trending_topics(
  p_limit integer default 12,
  p_window_days integer default 30
)
returns table (
  topic text,
  note_count bigint,
  recent_note_count bigint,
  interaction_count bigint,
  score double precision,
  is_followed boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
with note_engagement as (
  select
    n.id,
    n.tags,
    n.created_at,
    greatest(n.view_count, 0) as view_count,
    (select count(*) from public.likes l where l.note_id = n.id) as likes,
    (select count(*) from public.favorites f where f.note_id = n.id) as favorites,
    (select count(*) from public.comments c where c.note_id = n.id and c.deleted_at is null and c.is_hidden = false) as comments
  from public.notes n
  where n.status = 'published'
    and n.is_hidden = false
    and n.visibility = 'public'
),
topic_notes as (
  select btrim(tag) as topic, e.*
  from note_engagement e
  cross join lateral unnest(coalesce(e.tags, '{}'::text[])) as tag
  where btrim(tag) <> ''
),
stats as (
  select
    t.topic,
    count(*)::bigint as note_count,
    count(*) filter (
      where t.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_window_days, 30), 365)))
    )::bigint as recent_note_count,
    coalesce(sum(t.likes + t.favorites + t.comments), 0)::bigint as interaction_count,
    (
      ln(1 + coalesce(sum(
        t.likes * 1.5
        + t.favorites * 2.5
        + t.comments * 2.0
        + t.view_count * 0.03
      ), 0))
      + count(*) filter (
          where t.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_window_days, 30), 365)))
        ) * 0.25
      + greatest(0, 2.0 - extract(epoch from (now() - max(t.created_at))) / 86400.0 / 15.0)
    )::double precision as score
  from topic_notes t
  group by t.topic
)
select
  s.topic,
  s.note_count,
  s.recent_note_count,
  s.interaction_count,
  s.score,
  exists (
    select 1
    from public.topic_follows tf
    where tf.user_id = (select auth.uid())
      and lower(tf.topic) = lower(s.topic)
  ) as is_followed
from stats s
order by s.score desc, s.recent_note_count desc, s.topic
limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

create or replace function public.get_topic_note_ids(
  p_topic text,
  p_sort text default 'hot',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  note_id uuid,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
with eligible as (
  select
    n.id,
    n.created_at,
    n.view_count,
    (select count(*) from public.likes l where l.note_id = n.id) as likes,
    (select count(*) from public.favorites f where f.note_id = n.id) as favorites,
    (select count(*) from public.comments c where c.note_id = n.id and c.deleted_at is null and c.is_hidden = false) as comments
  from public.notes n
  where n.status = 'published'
    and n.is_hidden = false
    and n.visibility = 'public'
    and exists (
      select 1
      from unnest(coalesce(n.tags, '{}'::text[])) as tag
      where lower(btrim(tag)) = lower(btrim(coalesce(p_topic, '')))
    )
), ranked as (
  select
    e.id,
    case
      when lower(coalesce(p_sort, 'hot')) = 'latest'
        then extract(epoch from e.created_at)
      else
        ln(1 + e.likes * 1.5 + e.favorites * 2.5 + e.comments * 2.0 + greatest(e.view_count, 0) * 0.03)
        + greatest(0, 3.0 - extract(epoch from (now() - e.created_at)) / 86400.0 / 18.0)
    end::double precision as final_score
  from eligible e
)
select r.id, r.final_score
from ranked r
order by r.final_score desc, r.id
limit greatest(1, least(coalesce(p_limit, 20), 50))
offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.get_personalized_note_ids(p_limit integer default 40, p_offset integer default 0, p_mode text default 'for_you')
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
  select n.id,
    (select count(*) from public.likes l where l.note_id=n.id) likes,
    (select count(*) from public.favorites f where f.note_id=n.id) favorites,
    (select count(*) from public.comments c where c.note_id=n.id and c.deleted_at is null and c.is_hidden=false) comments
  from public.notes n
  where n.visibility = 'public'
),
ranked as (
  select n.id,
    case
      when p_mode='following' then case when fol.following_id is not null then 8.0 else -100.0 end
      when p_mode='latest' then 0.0
      else coalesce(pref.tag_score,0)
        + coalesce(topic_pref.bonus,0)
        + case when fol.following_id is not null then 3.5 else 0 end
    end
    + ln(1 + e.likes*1.5 + e.favorites*2.5 + e.comments*2.0 + greatest(n.view_count,0)*0.03)
    + greatest(0, 2.5 - extract(epoch from (now()-n.created_at))/86400/12)
    + (mod(abs(hashtextextended(n.id::text || coalesce((select id::text from viewer),'guest'),0)),1000)::double precision/1000.0)*0.35
    - case when n.author_id=(select id from viewer) then 1.5 else 0 end as final_score,
    case when fol.following_id is not null then '关注作者'
         when topic_pref.followed_topic is not null then '关注话题 #' || topic_pref.followed_topic
         when coalesce(pref.tag_score,0) > 0.5 then '兴趣匹配'
         when (e.likes+e.favorites+e.comments) > 5 then '社区热门'
         else '新鲜内容' end as why,
    row_number() over(partition by n.author_id order by n.created_at desc) author_position
  from public.notes n
  join engagement e on e.id=n.id
  left join public.follows fol on fol.follower_id=(select id from viewer) and fol.following_id=n.author_id
  left join lateral (
    select sum(p.score) tag_score
    from public.user_tag_preferences p
    where p.user_id=(select id from viewer) and p.tag=any(n.tags)
  ) pref on true
  left join lateral (
    select max(tf.topic) as followed_topic, count(*)::double precision * 2.25 as bonus
    from public.topic_follows tf
    where tf.user_id=(select id from viewer)
      and exists (
        select 1 from unnest(coalesce(n.tags, '{}'::text[])) as note_tag
        where lower(btrim(note_tag)) = lower(tf.topic)
      )
  ) topic_pref on true
  where n.status='published' and n.is_hidden=false and n.visibility='public'
)
select id, final_score - greatest(0, author_position-2)*1.25, why
from ranked
where final_score > -50
order by (final_score - greatest(0, author_position-2)*1.25) desc, id
limit greatest(1, least(p_limit,100)) offset greatest(0,p_offset);
$$;

grant select, insert, delete on public.topic_follows to authenticated;
grant execute on function public.get_trending_topics(integer, integer) to anon, authenticated;
grant execute on function public.get_topic_note_ids(text, text, integer, integer) to anon, authenticated;
grant execute on function public.get_personalized_note_ids(integer, integer, text) to anon, authenticated;
