drop policy if exists reports_submit on public.content_reports;

create policy reports_submit
on public.content_reports for insert
with check (
  reporter_id = (select auth.uid())
  and private.is_enabled_user()
  and (
    (
      note_id is not null
      and comment_id is null
      and exists (
        select 1
        from public.notes n
        where n.id = content_reports.note_id
          and n.visibility = 'public'
          and n.status = 'published'
          and n.is_hidden = false
      )
    )
    or (
      comment_id is not null
      and exists (
        select 1
        from public.comments c
        join public.notes n on n.id = c.note_id
        where c.id = content_reports.comment_id
          and n.visibility = 'public'
          and n.status = 'published'
          and n.is_hidden = false
          and c.is_hidden = false
          and c.deleted_at is null
      )
    )
  )
);
