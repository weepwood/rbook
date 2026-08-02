do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'creator_analytics_summary'
    and pg_get_function_identity_arguments(p.oid) = 'p_days integer';

  if v_definition is null then
    raise exception 'creator_analytics_summary function not found';
  end if;

  if position('n.visibility = ''public''' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'where n.author_id = v_author_id',
      'where n.author_id = v_author_id' || E'\n      and n.visibility = ''public'''
    );
    execute v_definition;
  end if;
end;
$$;

revoke all on function public.creator_analytics_summary(integer) from public;
revoke all on function public.creator_analytics_summary(integer) from anon;
grant execute on function public.creator_analytics_summary(integer) to authenticated;
grant execute on function public.creator_analytics_summary(integer) to service_role;
