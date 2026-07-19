-- RBook Issue #1: search, reliable creation, recommendation feedback,
-- realtime notifications, and structured moderation.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.notes
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists published_at timestamptz,
  add column if not exists scheduled_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists version integer not null default 1;

update public.notes
set published_at = coalesce(published_at, created_at)
where status = 'published';

alter table public.note_media
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists thumbnail_path text,
  add column if not exists alt_text text,
  add column if not exists upload_state text not null default 'ready';

alter table public.notifications
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists target_path text,
  add column if not exists group_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.notifications
set target_type = case
    when comment_id is not null then 'comment'
    when note_id is not null then 'note'
    when kind = 'follow' then 'profile'
    else 'system'
  end,
  target_id = coalesce(comment_id::text, note_id::text),
  target_path = case
    when note_id is not null then '/note/' || note_id::text
    else target_path
  end
where target_type is null or target_path is null;

alter table public.content_reports
  add column if not exists category text not null default 'other',
  add column if not exists priority smallint not null default 0,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists resolution_note text,
  add column if not exists content_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists reviewed_at timestamptz;

create table if not exists public.user_note_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('not_interested', 'hide_author')),
  created_at timestamptz not null default now(),
  primary key (user_id, note_id, feedback_type)
);

create table if not exists public.user_hidden_authors (
  user_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, author_id),
  check (user_id <> author_id)
);

create table if not exists public.search_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  query text not null,
  result_type text,
  result_id text,
  event_type text not null default 'search' check (event_type in ('search', 'click')),
  created_at timestamptz not null default now()
);

create index if not exists notes_title_trgm_idx
  on public.notes using gin (title extensions.gin_trgm_ops);
create index if not exists notes_content_trgm_idx
  on public.notes using gin (content extensions.gin_trgm_ops);
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username extensions.gin_trgm_ops);
create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops);
create index if not exists notes_tags_gin_idx on public.notes using gin (tags);
create index if not exists notes_status_created_idx on public.notes (status, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc) where read_at is null;
create index if not exists search_events_query_created_idx
  on public.search_events (lower(query), created_at desc);
create index if not exists feedback_user_created_idx
  on public.user_note_feedback (user_id, created_at desc);
create unique index if not exists content_reports_pending_unique_idx
  on public.content_reports (
    reporter_id,
    coalesce(note_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    category
  )
  where review_state = 'pending';

alter table public.user_note_feedback enable row level security;
alter table public.user_hidden_authors enable row level security;
alter table public.search_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_note_feedback' and policyname = 'feedback_owner_all'
  ) then
    create policy feedback_owner_all on public.user_note_feedback
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_hidden_authors' and policyname = 'hidden_authors_owner_all'
  ) then
    create policy hidden_authors_owner_all on public.user_hidden_authors
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'search_events' and policyname = 'search_events_insert'
  ) then
    create policy search_events_insert on public.search_events
      for insert to anon, authenticated
      with check (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notes' and policyname = 'authors_read_own_notes'
  ) then
    create policy authors_read_own_notes on public.notes
      for select to authenticated
      using (auth.uid() = author_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notes' and policyname = 'authors_insert_own_notes'
  ) then
    create policy authors_insert_own_notes on public.notes
      for insert to authenticated
      with check (auth.uid() = author_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notes' and policyname = 'authors_update_own_notes'
  ) then
    create policy authors_update_own_notes on public.notes
      for update to authenticated
      using (auth.uid() = author_id)
      with check (auth.uid() = author_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notes' and policyname = 'authors_delete_own_drafts'
  ) then
    create policy authors_delete_own_drafts on public.notes
      for delete to authenticated
      using (auth.uid() = author_id and status = 'draft');
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;

create or replace function public.search_rbook(
  p_query text,
  p_type text default 'all',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  result_type text,
  result_id text,
  title text,
  subtitle text,
  username text,
  tags text[],
  created_at timestamptz,
  score double precision,
  metadata jsonb
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with input as (
    select trim(coalesce(p_query, '')) as query,
           '%' || trim(coalesce(p_query, '')) || '%' as pattern
  ),
  note_results as (
    select
      'note'::text as result_type,
      n.id::text as result_id,
      n.title,
      left(n.content, 180) as subtitle,
      p.username,
      n.tags,
      n.created_at,
      (
        greatest(
          similarity(lower(n.title), lower(i.query)),
          similarity(lower(n.content), lower(i.query)) * 0.55,
          case when exists (
            select 1 from unnest(coalesce(n.tags, '{}'::text[])) tag
            where lower(tag) = lower(i.query)
          ) then 1.0 else 0.0 end
        ) + ln((2 + coalesce(n.view_count, 0))::double precision) * 0.015
      )::double precision as score,
      jsonb_build_object(
        'author_id', n.author_id,
        'cover_url', n.cover_url,
        'like_count', (select count(*) from public.likes l where l.note_id = n.id),
        'comment_count', (select count(*) from public.comments c where c.note_id = n.id and c.deleted_at is null)
      ) as metadata
    from public.notes n
    join public.profiles p on p.id = n.author_id
    cross join input i
    where n.status = 'published'
      and coalesce(n.is_hidden, false) = false
      and i.query <> ''
      and (
        n.title ilike i.pattern
        or n.content ilike i.pattern
        or exists (
          select 1 from unnest(coalesce(n.tags, '{}'::text[])) tag
          where tag ilike i.pattern
        )
      )
  ),
  profile_results as (
    select
      'user'::text as result_type,
      p.id::text as result_id,
      p.display_name as title,
      coalesce(p.bio, '') as subtitle,
      p.username,
      '{}'::text[] as tags,
      p.created_at,
      (
        greatest(
          similarity(lower(p.username), lower(i.query)),
          similarity(lower(p.display_name), lower(i.query))
        ) + ln((2 + coalesce(p.follower_count, 0))::double precision) * 0.025
      )::double precision as score,
      jsonb_build_object(
        'avatar_url', p.avatar_url,
        'follower_count', p.follower_count,
        'note_count', p.note_count,
        'location', p.location
      ) as metadata
    from public.profiles p
    cross join input i
    where i.query <> ''
      and (p.username ilike i.pattern or p.display_name ilike i.pattern)
  ),
  topic_results as (
    select
      'topic'::text as result_type,
      tag as result_id,
      '#' || tag as title,
      count(*)::text || ' 篇公开笔记' as subtitle,
      null::text as username,
      array[tag]::text[] as tags,
      max(n.created_at) as created_at,
      (
        similarity(lower(tag), lower(i.query)) + ln((2 + count(*))::double precision) * 0.08
      )::double precision as score,
      jsonb_build_object('note_count', count(*)) as metadata
    from public.notes n
    cross join lateral unnest(coalesce(n.tags, '{}'::text[])) tag
    cross join input i
    where n.status = 'published'
      and coalesce(n.is_hidden, false) = false
      and i.query <> ''
      and tag ilike i.pattern
    group by tag, i.query
  ),
  combined as (
    select * from note_results where p_type in ('all', 'note', 'notes')
    union all
    select * from profile_results where p_type in ('all', 'user', 'users')
    union all
    select * from topic_results where p_type in ('all', 'topic', 'topics')
  )
  select *
  from combined
  order by score desc, created_at desc nulls last, result_id
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_rbook(text, text, integer, integer) to anon, authenticated;

create or replace function public.record_note_feedback(
  p_note_id uuid,
  p_feedback_type text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_author uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if p_feedback_type not in ('not_interested', 'hide_author') then
    raise exception 'invalid_feedback_type';
  end if;

  insert into public.user_note_feedback(user_id, note_id, feedback_type)
  values (auth.uid(), p_note_id, p_feedback_type)
  on conflict (user_id, note_id, feedback_type) do nothing;

  if p_feedback_type = 'hide_author' then
    select author_id into target_author from public.notes where id = p_note_id;
    if target_author is not null and target_author <> auth.uid() then
      insert into public.user_hidden_authors(user_id, author_id)
      values (auth.uid(), target_author)
      on conflict (user_id, author_id) do nothing;
    end if;
  end if;
end;
$$;

grant execute on function public.record_note_feedback(uuid, text) to authenticated;

create or replace function public.record_search_event(
  p_query text,
  p_session_id uuid default null,
  p_result_type text default null,
  p_result_id text default null,
  p_event_type text default 'search'
)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.search_events(user_id, session_id, query, result_type, result_id, event_type)
  values (auth.uid(), p_session_id, left(trim(p_query), 200), p_result_type, p_result_id, p_event_type);
$$;

grant execute on function public.record_search_event(text, uuid, text, text, text) to anon, authenticated;

comment on function public.search_rbook is 'Unified public search for notes, creators, and topics.';
comment on function public.record_note_feedback is 'Stores recommendation negative feedback and optional author hiding.';
