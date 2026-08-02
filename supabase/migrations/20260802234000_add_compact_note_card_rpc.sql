create or replace function public.get_note_cards_by_ids(p_note_ids uuid[])
returns table (
  id uuid,
  author_id uuid,
  title text,
  tags text[],
  location text,
  cover_url text,
  visibility text,
  view_count bigint,
  created_at timestamptz,
  published_at timestamptz,
  status text,
  author jsonb,
  media jsonb,
  like_count bigint,
  favorite_count bigint,
  comment_count bigint,
  viewer_liked boolean,
  viewer_favorited boolean,
  ordinal bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested as (
    select value as note_id, ordinality
    from unnest(coalesce(p_note_ids, '{}'::uuid[])) with ordinality as requested_ids(value, ordinality)
  )
  select
    n.id,
    n.author_id,
    n.title,
    coalesce(n.tags, '{}'::text[]) as tags,
    n.location,
    n.cover_url,
    n.visibility,
    n.view_count,
    n.created_at,
    n.published_at,
    n.status::text,
    jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'bio', p.bio,
      'location', p.location,
      'follower_count', p.follower_count,
      'following_count', p.following_count,
      'note_count', p.note_count
    ) as author,
    media_row.media,
    (select count(*) from public.likes l where l.note_id = n.id) as like_count,
    (select count(*) from public.favorites f where f.note_id = n.id) as favorite_count,
    (select count(*) from public.comments c where c.note_id = n.id and c.is_hidden = false and c.deleted_at is null) as comment_count,
    exists (
      select 1 from public.likes vl
      where vl.note_id = n.id and vl.user_id = auth.uid()
    ) as viewer_liked,
    exists (
      select 1 from public.favorites vf
      where vf.note_id = n.id and vf.user_id = auth.uid()
    ) as viewer_favorited,
    requested.ordinality as ordinal
  from requested
  join public.notes n on n.id = requested.note_id
  join public.profiles p on p.id = n.author_id
  left join lateral (
    select jsonb_build_object(
      'id', nm.id,
      'note_id', nm.note_id,
      'storage_path', nm.storage_path,
      'storage_bucket', nm.storage_bucket,
      'width', nm.width,
      'height', nm.height,
      'sort_order', nm.sort_order,
      'mime_type', nm.mime_type,
      'size_bytes', nm.size_bytes,
      'thumbnail_path', nm.thumbnail_path,
      'alt_text', nm.alt_text,
      'upload_state', nm.upload_state
    ) as media
    from public.note_media nm
    where nm.note_id = n.id
      and coalesce(nm.upload_state, 'ready') = 'ready'
    order by nm.sort_order asc, nm.created_at asc
    limit 1
  ) media_row on true
  where n.status = 'published'::public.note_status
    and n.is_hidden = false
  order by requested.ordinality;
$$;

grant execute on function public.get_note_cards_by_ids(uuid[]) to anon, authenticated;
