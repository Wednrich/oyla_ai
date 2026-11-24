-- Read only. Run in the Supabase SQL Editor after applying the Phase 04 migration.
with checks (object, passed) as (
  select 'Guided tables exist with RLS', count(*) = 3
  from pg_tables
  where rowsecurity and (
    (schemaname = 'public' and tablename in ('oyla_guided_sessions', 'oyla_guided_turns'))
    or (schemaname = 'oyla_private' and tablename = 'guided_research_events')
  )
  union all
  select 'Owner read policies', count(*) = 2 from pg_policies
  where schemaname = 'public' and tablename in ('oyla_guided_sessions', 'oyla_guided_turns')
    and policyname = 'own_read' and cmd = 'SELECT' and roles = '{authenticated}'
  union all
  select 'Guided RPCs are service-only', count(*) = 3 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('oyla_begin_guided_turn', 'oyla_finish_guided_turn', 'oyla_end_guided_session')
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
  union all
  select 'Research export is private', count(*) = 1 from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'oyla_private' and c.relname = 'guided_research_export' and c.relkind = 'v'
    and has_table_privilege('service_role', c.oid, 'SELECT')
    and not has_table_privilege('authenticated', c.oid, 'SELECT')
    and not has_table_privilege('anon', c.oid, 'SELECT')
)
select object, case when passed then 'PASS' else 'FAIL' end as status from checks order by object;
