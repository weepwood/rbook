-- Private notes are visible only to their author.
-- Public and private note images are stored in separate buckets.

alter table public.notes
  add column if not exists visibility text not null default 'public';

alter table public.notes drop constraint if exists notes_visibility_check;
alter table public.notes
  add constraint notes_visibility_check check (visibility in ('public', 'private'));

alter table public.note_media
  add column if not exists storage_bucket text not null default 'note-media';

alter table public.note_media drop constraint if exists note_media_storage_bucket_check;
alter table public.note_media
  add constraint note_media_storage_bucket_check check (storage_bucket in ('note-media', 'private-note-media'));

create index if not exists notes_author_visibility_created_idx
  on public.notes(author_id, visibility, created_at desc);

create index if not exists notes_public_feed_idx
  on public.notes(created_at desc)
  where status = 'published' and is_hidden = false and visibility = 'public';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-note-media',
  'private-note-media',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "private note media owner read" on storage.objects;
create policy "private note media owner read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'private-note-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "private note media owner upload" on storage.objects;
create policy "private note media owner upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'private-note-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "private note media owner update" on storage.objects;
create policy "private note media owner update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'private-note-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'private-note-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "private note media owner delete" on storage.objects;
create policy "private note media owner delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'private-note-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists published_notes_public_read on public.notes;
create policy published_notes_public_read
on public.notes for select
using (
  (
    visibility = 'public'
    and status = 'published'
    and is_hidden = false
  )
  or author_id = (select auth.uid())
  or (
    visibility = 'public'
    and private.can_moderate()
  )
);

drop policy if exists published_media_public_read on public.note_media;
create policy published_media_public_read
on public.note_media for select
using (
  exists (
    select 1
    from public.notes n
    where n.id = note_media.note_id
      and (
        (n.visibility = 'public' and n.status = 'published' and n.is_hidden = false)
        or n.author_id = (select auth.uid())
        or (n.visibility = 'public' and private.can_moderate())
      )
  )
);

drop policy if exists likes_public_read on public.likes;
create policy likes_public_read
on public.likes for select
using (
  exists (
    select 1 from public.notes n
    where n.id = likes.note_id
      and n.visibility = 'public'
      and n.status = 'published'
      and n.is_hidden = false
  )
);

drop policy if exists likes_owner_insert on public.likes;
create policy likes_owner_insert
on public.likes for insert
with check (
  user_id = (select auth.uid())
  and private.is_enabled_user()
  and exists (
    select 1 from public.notes n
    where n.id = likes.note_id
      and n.visibility = 'public'
      and n.status = 'published'
      and n.is_hidden = false
  )
);

drop policy if exists favorites_owner_read on public.favorites;
create policy favorites_owner_read
on public.favorites for select
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.notes n
    where n.id = favorites.note_id
      and n.visibility = 'public'
      and n.status = 'published'
      and n.is_hidden = false
  )
);

drop policy if exists favorites_owner_insert on public.favorites;
create policy favorites_owner_insert
on public.favorites for insert
with check (
  user_id = (select auth.uid())
  and private.is_enabled_user()
  and exists (
    select 1 from public.notes n
    where n.id = favorites.note_id
      and n.visibility = 'public'
      and n.status = 'published'
      and n.is_hidden = false
  )
);

drop policy if exists comments_owner_insert on public.comments;
create policy comments_owner_insert
on public.comments for insert
with check (
  author_id = (select auth.uid())
  and private.is_enabled_user()
  and exists (
    select 1 from public.notes n
    where n.id = comments.note_id
      and n.visibility = 'public'
      and n.status = 'published'
      and n.is_hidden = false
  )
);

drop policy if exists comments_public_read on public.comments;
create policy comments_public_read
on public.comments for select
using (
  exists (
    select 1 from public.notes n
    where n.id = comments.note_id
      and (
        (
          n.visibility = 'public'
          and ((n.status = 'published' and n.is_hidden = false) or private.can_moderate())
          and (
            (comments.is_hidden = false and comments.deleted_at is null)
            or comments.author_id = (select auth.uid())
            or private.can_moderate()
          )
        )
        or n.author_id = (select auth.uid())
      )
  )
);

drop policy if exists "comment likes are readable" on public.comment_likes;
create policy "comment likes are readable"
on public.comment_likes for select
using (
  exists (
    select 1
    from public.comments c
    join public.notes n on n.id = c.note_id
    where c.id = comment_likes.comment_id
      and n.visibility = 'public'
      and n.status = 'published'
      and n.is_hidden = false
      and c.is_hidden = false
      and c.deleted_at is null
  )
);

drop policy if exists "members like comments" on public.comment_likes;
create policy "members like comments"
on public.comment_likes for insert
with check (
  (select auth.uid()) = user_id
  and private.is_enabled_user()
  and exists (
    select 1
    from public.comments c
    join public.notes n on n.id = c.note_id
    where c.id = comment_likes.comment_id
      and n.visibility = 'public'
      and n.status = 'published'
      and n.is_hidden = false
      and c.is_hidden = false
      and c.deleted_at is null
  )
);

create or replace function public.adjust_note_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_public boolean := false;
  new_public boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_public := old.status = 'published' and old.visibility = 'public';
  end if;
  if tg_op <> 'DELETE' then
    new_public := new.status = 'published' and new.visibility = 'public';
  end if;

  if tg_op = 'INSERT' then
    if new_public then
      update public.profiles set note_count = note_count + 1 where id = new.author_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old_public then
      update public.profiles set note_count = greatest(note_count - 1, 0) where id = old.author_id;
    end if;
  elsif old_public is distinct from new_public or old.author_id is distinct from new.author_id then
    if old_public then
      update public.profiles set note_count = greatest(note_count - 1, 0) where id = old.author_id;
    end if;
    if new_public then
      update public.profiles set note_count = note_count + 1 where id = new.author_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

update public.profiles p
set note_count = (
  select count(*)::integer
  from public.notes n
  where n.author_id = p.id
    and n.status = 'published'
    and n.visibility = 'public'
);

create or replace function public.get_personalized_note_ids(
  p_limit integer default 40,
  p_offset integer default 0,
  p_mode text default 'for_you'
)
returns table(note_id uuid, score double precision, reason text)
language sql
stable
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
      else coalesce(pref.tag_score,0) + case when fol.following_id is not null then 3.5 else 0 end
    end
    + ln(1 + e.likes*1.5 + e.favorites*2.5 + e.comments*2.0 + greatest(n.view_count,0)*0.03)
    + greatest(0, 2.5 - extract(epoch from (now()-n.created_at))/86400/12)
    + (mod(abs(hashtextextended(n.id::text || coalesce((select id::text from viewer),'guest'),0)),1000)::double precision/1000.0)*0.35
    - case when n.author_id=(select id from viewer) then 1.5 else 0 end as final_score,
    case when fol.following_id is not null then '关注作者'
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
  where n.status='published' and n.is_hidden=false and n.visibility='public'
)
select id, final_score - greatest(0, author_position-2)*1.25, why
from ranked
where final_score > -50
order by (final_score - greatest(0, author_position-2)*1.25) desc, id
limit greatest(1, least(p_limit,100)) offset greatest(0,p_offset);
$$;

create or replace function public.get_related_note_ids(p_note_id uuid, p_limit integer default 8)
returns table(note_id uuid, score double precision)
language sql
stable
set search_path = ''
as $$
with source as (
  select id, author_id, tags
  from public.notes
  where id=p_note_id and visibility='public'
),
scored as (
  select n.id,
    coalesce((select count(*) from unnest(n.tags) t where t=any(s.tags)),0)*4.0
    + case when n.author_id=s.author_id then 1.5 else 0 end
    + ln(1 + (select count(*) from public.likes l where l.note_id=n.id) + (select count(*) from public.favorites f where f.note_id=n.id)*2)
    + greatest(0,1.5-extract(epoch from(now()-n.created_at))/86400/30) score
  from public.notes n cross join source s
  where n.id<>s.id
    and n.status='published'
    and n.is_hidden=false
    and n.visibility='public'
)
select id, score from scored order by score desc, id limit greatest(1,least(p_limit,20));
$$;

create or replace function public.record_content_event(
  p_note_id uuid,
  p_event_type text,
  p_session_id text default null,
  p_dwell_ms integer default null,
  p_source text default 'other'
)
returns void
language plpgsql
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
      and visibility = 'public'
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
