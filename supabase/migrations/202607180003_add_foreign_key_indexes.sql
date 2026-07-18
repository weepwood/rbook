-- Add covering indexes for foreign keys used by common user and comment queries.

create index comments_author_idx on public.comments (author_id);
create index comments_parent_idx on public.comments (parent_id) where parent_id is not null;
create index favorites_user_idx on public.favorites (user_id);
create index likes_user_idx on public.likes (user_id);
