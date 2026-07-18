alter table public.comments
  add column if not exists like_count integer not null default 0,
  add column if not exists reply_count integer not null default 0;

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.content_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  session_id text,
  note_id uuid not null references public.notes(id) on delete cascade,
  event_type text not null check (
    event_type in ('impression','open','dwell','like','favorite','comment','share','follow_author')
  ),
  dwell_ms integer check (dwell_ms is null or dwell_ms between 0 and 1800000),
  created_at timestamptz not null default now()
);

create table if not exists public.user_tag_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 80),
  score double precision not null default 0,
  interactions integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, tag)
);

create index if not exists comment_likes_user_idx
  on public.comment_likes(user_id, created_at desc);
create index if not exists content_events_note_created_idx
  on public.content_events(note_id, created_at desc);
create index if not exists content_events_user_created_idx
  on public.content_events(user_id, created_at desc) where user_id is not null;
create index if not exists content_events_session_idx
  on public.content_events(session_id, note_id, created_at desc) where session_id is not null;
create index if not exists user_tag_preferences_score_idx
  on public.user_tag_preferences(user_id, score desc);

alter table public.comment_likes enable row level security;
alter table public.content_events enable row level security;
alter table public.user_tag_preferences enable row level security;

drop policy if exists "comment likes are readable" on public.comment_likes;
drop policy if exists "members like comments" on public.comment_likes;
drop policy if exists "members unlike comments" on public.comment_likes;
drop policy if exists "members read own interests" on public.user_tag_preferences;
drop policy if exists "members insert own content events" on public.content_events;
drop policy if exists "guests insert anonymous content events" on public.content_events;
drop policy if exists "members read own content events" on public.content_events;

create policy "comment likes are readable"
  on public.comment_likes for select using (true);
create policy "members like comments"
  on public.comment_likes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_access ua
      where ua.user_id = (select auth.uid()) and ua.state = 'enabled'
    )
  );
create policy "members unlike comments"
  on public.comment_likes for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_access ua
      where ua.user_id = (select auth.uid()) and ua.state = 'enabled'
    )
  );
create policy "members read own interests"
  on public.user_tag_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "members insert own content events"
  on public.content_events for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.user_access ua
      where ua.user_id = (select auth.uid()) and ua.state = 'enabled'
    )
  );
create policy "guests insert anonymous content events"
  on public.content_events for insert to anon
  with check (
    user_id is null
    and session_id is not null
    and char_length(session_id) between 1 and 120
  );
create policy "members read own content events"
  on public.content_events for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.comment_likes, public.user_tag_preferences to anon, authenticated;
grant insert, delete on public.comment_likes to authenticated;
grant insert on public.content_events to anon, authenticated;
grant select on public.content_events to authenticated;
grant usage, select on sequence public.content_events_id_seq to anon, authenticated;

create or replace function public.sync_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.comments
  set like_count = greatest(0, like_count + case when tg_op = 'INSERT' then 1 else -1 end)
  where id = coalesce(new.comment_id, old.comment_id);
  return coalesce(new, old);
end;
$$;

create or replace function public.sync_comment_reply_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.parent_id is not null then
    update public.comments set reply_count = reply_count + 1 where id = new.parent_id;
  elsif tg_op = 'DELETE' and old.parent_id is not null then
    update public.comments set reply_count = greatest(0, reply_count - 1) where id = old.parent_id;
  elsif tg_op = 'UPDATE'
    and old.deleted_at is distinct from new.deleted_at
    and new.parent_id is not null then
    update public.comments
    set reply_count = greatest(
      0,
      reply_count + case when new.deleted_at is null then 1 else -1 end
    )
    where id = new.parent_id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.process_content_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weight double precision;
  v_tags text[];
begin
  if new.event_type = 'open' then
    update public.notes set view_count = view_count + 1 where id = new.note_id;
  end if;

  if new.user_id is null then
    return new;
  end if;

  v_weight := case new.event_type
    when 'impression' then 0.02
    when 'open' then 0.4
    when 'dwell' then least(2.0, greatest(0.1, coalesce(new.dwell_ms, 0) / 30000.0))
    when 'like' then 2.0
    when 'favorite' then 3.5
    when 'comment' then 4.0
    when 'share' then 5.0
    when 'follow_author' then 5.0
    else 0
  end;

  select tags into v_tags from public.notes where id = new.note_id;

  insert into public.user_tag_preferences(user_id, tag, score, interactions, updated_at)
  select new.user_id, item, v_weight, 1, now()
  from unnest(coalesce(v_tags, array[]::text[])) item
  on conflict (user_id, tag) do update
  set score = least(100, public.user_tag_preferences.score * 0.96 + excluded.score),
      interactions = public.user_tag_preferences.interactions + 1,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists comment_like_count_trigger on public.comment_likes;
create trigger comment_like_count_trigger
  after insert or delete on public.comment_likes
  for each row execute function public.sync_comment_like_count();

drop trigger if exists comment_reply_count_trigger on public.comments;
create trigger comment_reply_count_trigger
  after insert or delete or update of deleted_at on public.comments
  for each row execute function public.sync_comment_reply_count();

drop trigger if exists process_content_event_trigger on public.content_events;
create trigger process_content_event_trigger
  after insert on public.content_events
  for each row execute function public.process_content_event();

revoke execute on function public.sync_comment_like_count() from public, anon, authenticated;
revoke execute on function public.sync_comment_reply_count() from public, anon, authenticated;
revoke execute on function public.process_content_event() from public, anon, authenticated;