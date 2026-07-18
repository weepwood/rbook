-- Trigger functions are internal implementation details.
-- They must not be callable through PostgREST RPC endpoints.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.adjust_note_count() from public, anon, authenticated;
revoke execute on function public.adjust_follow_counts() from public, anon, authenticated;
