-- Cover foreign keys used by administrator, notification and report queries.

create index if not exists admin_audit_administrator_idx
  on public.admin_audit_logs (administrator_id)
  where administrator_id is not null;

create index if not exists content_reports_reporter_idx
  on public.content_reports (reporter_id);

create index if not exists content_reports_note_idx
  on public.content_reports (note_id)
  where note_id is not null;

create index if not exists content_reports_comment_idx
  on public.content_reports (comment_id)
  where comment_id is not null;

create index if not exists content_reports_handler_idx
  on public.content_reports (handled_by)
  where handled_by is not null;

create index if not exists notifications_actor_idx
  on public.notifications (actor_id)
  where actor_id is not null;

create index if not exists notifications_note_idx
  on public.notifications (note_id)
  where note_id is not null;

create index if not exists notifications_comment_idx
  on public.notifications (comment_id)
  where comment_id is not null;
