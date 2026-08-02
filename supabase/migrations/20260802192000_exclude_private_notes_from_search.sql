create or replace function public.search_rbook(
  p_query text,
  p_type text default 'all',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
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
set search_path to 'public', 'extensions'
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
      and n.visibility = 'public'
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
      and n.visibility = 'public'
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
