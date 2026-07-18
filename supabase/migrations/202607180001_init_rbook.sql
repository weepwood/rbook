-- RBook initial schema
-- PostgreSQL + Supabase Auth + Storage + RLS

create extension if not exists pgcrypto;

create type public.note_status as enum ('draft', 'published', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  bio text not null default '',
  location text,
  follower_count integer not null default 0 check (follower_count >= 0),
  following_count integer not null default 0 check (following_count >= 0),
  note_count integer not null default 0 check (note_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$')
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  content text not null check (char_length(content) between 1 and 3000),
  tags text[] not null default '{}',
  location text,
  cover_url text,
  status public.note_status not null default 'draft',
  view_count bigint not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.note_media (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  storage_path text not null unique,
  width integer,
  height integer,
  sort_order smallint not null default 0 check (sort_order between 0 and 8),
  created_at timestamptz not null default now()
);

create table public.likes (
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create table public.favorites (
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint cannot_follow_self check (follower_id <> following_id)
);

create index notes_author_created_idx on public.notes (author_id, created_at desc);
create index notes_status_created_idx on public.notes (status, created_at desc);
create index notes_tags_gin_idx on public.notes using gin (tags);
create index note_media_note_sort_idx on public.note_media (note_id, sort_order);
create index comments_note_created_idx on public.comments (note_id, created_at);
create index follows_following_idx on public.follows (following_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_username text;
  safe_username text;
begin
  base_username := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'user'),
    '[^a-zA-Z0-9_]',
    '',
    'g'
  ));

  if char_length(base_username) < 3 then
    base_username := 'user';
  end if;

  safe_username := left(base_username, 16) || '_' || substr(replace(new.id::text, '-', ''), 1, 6);

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    safe_username,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'RBook 用户'),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.adjust_note_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'published' then
    update public.profiles set note_count = note_count + 1 where id = new.author_id;
  elsif tg_op = 'DELETE' and old.status = 'published' then
    update public.profiles set note_count = greatest(note_count - 1, 0) where id = old.author_id;
  elsif tg_op = 'UPDATE' and old.status <> new.status then
    update public.profiles
      set note_count = greatest(note_count + case when new.status = 'published' then 1 else -1 end, 0)
      where id = new.author_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger notes_adjust_profile_count
after insert or update of status or delete on public.notes
for each row execute function public.adjust_note_count();

create or replace function public.adjust_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set follower_count = follower_count + 1 where id = new.following_id;
  else
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.following_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger follows_adjust_profile_counts
after insert or delete on public.follows
for each row execute function public.adjust_follow_counts();

alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.note_media enable row level security;
alter table public.likes enable row level security;
alter table public.favorites enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;

create policy "profiles_public_read"
on public.profiles for select
to anon, authenticated
using (true);

create policy "profiles_owner_update"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "published_notes_public_read"
on public.notes for select
to anon, authenticated
using (status = 'published' or author_id = (select auth.uid()));

create policy "notes_owner_insert"
on public.notes for insert
to authenticated
with check (author_id = (select auth.uid()));

create policy "notes_owner_update"
on public.notes for update
to authenticated
using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));

create policy "notes_owner_delete"
on public.notes for delete
to authenticated
using (author_id = (select auth.uid()));

create policy "published_media_public_read"
on public.note_media for select
to anon, authenticated
using (
  exists (
    select 1 from public.notes
    where notes.id = note_media.note_id
      and (notes.status = 'published' or notes.author_id = (select auth.uid()))
  )
);

create policy "media_owner_insert"
on public.note_media for insert
to authenticated
with check (
  exists (
    select 1 from public.notes
    where notes.id = note_media.note_id
      and notes.author_id = (select auth.uid())
  )
);

create policy "media_owner_delete"
on public.note_media for delete
to authenticated
using (
  exists (
    select 1 from public.notes
    where notes.id = note_media.note_id
      and notes.author_id = (select auth.uid())
  )
);

create policy "likes_public_read"
on public.likes for select
to anon, authenticated
using (true);

create policy "likes_owner_insert"
on public.likes for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "likes_owner_delete"
on public.likes for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "favorites_owner_read"
on public.favorites for select
to authenticated
using (user_id = (select auth.uid()));

create policy "favorites_owner_insert"
on public.favorites for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "favorites_owner_delete"
on public.favorites for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "comments_public_read"
on public.comments for select
to anon, authenticated
using (true);

create policy "comments_owner_insert"
on public.comments for insert
to authenticated
with check (author_id = (select auth.uid()));

create policy "comments_owner_update"
on public.comments for update
to authenticated
using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));

create policy "comments_owner_delete"
on public.comments for delete
to authenticated
using (author_id = (select auth.uid()));

create policy "follows_public_read"
on public.follows for select
to anon, authenticated
using (true);

create policy "follows_owner_insert"
on public.follows for insert
to authenticated
with check (follower_id = (select auth.uid()));

create policy "follows_owner_delete"
on public.follows for delete
to authenticated
using (follower_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-media',
  'note-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "note_media_authenticated_upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'note-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "note_media_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'note-media'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'note-media'
  and owner_id = (select auth.uid())::text
);

create policy "note_media_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'note-media'
  and owner_id = (select auth.uid())::text
);

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.notes, public.note_media, public.likes, public.comments, public.follows to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
