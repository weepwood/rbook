-- Follow-up hardening for Issue #1 product-loop migration.
-- Keep this migration after 20260719160000 so repeated/fresh db pushes
-- end with the optimized and non-duplicated policy/index state.

-- Existing notes_owner_* and published_notes_public_read policies already
-- cover authors, enabled-account checks, and moderator access.
drop policy if exists authors_read_own_notes on public.notes;
drop policy if exists authors_insert_own_notes on public.notes;
drop policy if exists authors_update_own_notes on public.notes;
drop policy if exists authors_delete_own_drafts on public.notes;

-- Initialize auth.uid() once per statement for better RLS performance.
drop policy if exists feedback_owner_all on public.user_note_feedback;
create policy feedback_owner_all on public.user_note_feedback
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists hidden_authors_owner_all on public.user_hidden_authors;
create policy hidden_authors_owner_all on public.user_hidden_authors
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists search_events_insert on public.search_events;
create policy search_events_insert on public.search_events
  for insert to anon, authenticated
  with check (user_id is null or (select auth.uid()) = user_id);

-- Cover newly introduced foreign keys.
create index if not exists content_reports_assigned_to_idx
  on public.content_reports (assigned_to)
  where assigned_to is not null;
create index if not exists search_events_user_id_idx
  on public.search_events (user_id, created_at desc)
  where user_id is not null;
create index if not exists user_hidden_authors_author_id_idx
  on public.user_hidden_authors (author_id);
create index if not exists user_note_feedback_note_id_idx
  on public.user_note_feedback (note_id);

-- Keep the pre-existing unread notification index and remove the duplicate.
drop index if exists public.notifications_recipient_unread_idx;
