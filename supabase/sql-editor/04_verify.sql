-- OYLA 04. Verification. Every row in this read-only report should say PASS.
with expected_public (name) as (
  values ('profiles'), ('user_settings'), ('conversations'), ('messages'), ('courses'), ('lessons'),
    ('learning_progress'), ('practice_tasks'), ('practice_attempts'), ('assessments'), ('assessment_questions'),
    ('assessment_attempts'), ('study_materials'), ('learning_sessions'), ('research_consents'), ('research_events'),
    ('research_experiments'), ('experiment_results')
), expected_private (name) as (
  values ('practice_solutions'), ('assessment_answers'), ('chat_requests'), ('chat_rate_events')
), expected_indexes (name) as (
  values ('oyla_conversations_recent'), ('oyla_messages_order'), ('oyla_progress_lesson'),
    ('oyla_practice_attempts_user'), ('oyla_practice_attempts_task'), ('oyla_assessment_attempts_user'),
    ('oyla_assessment_attempts_assessment'), ('oyla_study_materials_user'), ('oyla_learning_sessions_user'),
    ('oyla_research_events_user'), ('oyla_research_events_session'), ('oyla_experiment_results_experiment'),
    ('oyla_chat_requests_conversation'), ('oyla_chat_rate_user_time')
), expected_triggers (schema_name, relation, name) as (
  values ('auth', 'users', 'oyla_initialize_user'), ('public', 'profiles', 'oyla_profiles_updated'),
    ('public', 'user_settings', 'oyla_settings_updated'), ('public', 'conversations', 'oyla_conversations_updated'),
    ('public', 'learning_progress', 'oyla_progress_updated')
), expected_functions (schema_name, name, student_exec, service_exec) as (
  values ('public', 'oyla_begin_chat', false, true), ('public', 'oyla_finish_chat', false, true),
    ('public', 'oyla_fail_chat', false, true), ('public', 'oyla_set_research_consent', false, true),
    ('public', 'oyla_dashboard', true, false), ('oyla_private', 'initialize_user', false, false),
    ('oyla_private', 'touch_updated_at', false, false)
), expected_buckets (name, bytes, types) as (
  values ('avatars', 2097152, array['image/jpeg', 'image/png', 'image/webp']),
    ('study-materials', 20971520, array['application/pdf'])
), expected_storage_policies (name, command, permissive) as (
  values ('oyla_private_file_read', 'SELECT', 'PERMISSIVE'),
    ('oyla_storage_owner_boundary', 'SELECT', 'RESTRICTIVE'),
    ('oyla_storage_server_insert', 'INSERT', 'RESTRICTIVE'),
    ('oyla_storage_server_update', 'UPDATE', 'RESTRICTIVE'),
    ('oyla_storage_server_delete', 'DELETE', 'RESTRICTIVE')
), checks (category, object, ok) as (
  select 'Public table + RLS', e.name, exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = e.name and c.relkind = 'r' and c.relrowsecurity
      and not has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
  ) from expected_public e
  union all
  select 'Private table + RLS', e.name, exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'oyla_private' and c.relname = e.name and c.relkind = 'r' and c.relrowsecurity
      and not has_schema_privilege('authenticated', n.oid, 'USAGE')
      and not has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
  ) from expected_private e
  union all
  select 'Index', e.name, exists (
    select 1 from pg_class c join pg_index i on i.indexrelid = c.oid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'oyla_private') and c.relname = e.name and i.indisvalid
  ) from expected_indexes e
  union all
  select 'Trigger', e.name, exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = e.schema_name and c.relname = e.relation and t.tgname = e.name and t.tgenabled in ('O', 'A')
  ) from expected_triggers e
  union all
  select 'Function grants', e.name, exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = e.schema_name and p.proname = e.name
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE') = e.student_exec
      and (e.schema_name = 'oyla_private' or has_function_privilege('service_role', p.oid, 'EXECUTE') = e.service_exec)
  ) from expected_functions e
  union all
  select 'Private Storage bucket', e.name, exists (
    select 1 from storage.buckets b where b.id = e.name and not b.public
      and b.file_size_limit = e.bytes and b.allowed_mime_types @> e.types and e.types @> b.allowed_mime_types
  ) from expected_buckets e
  union all
  select 'Storage policy', e.name, exists (
    select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
      and p.policyname = e.name and p.cmd = e.command and p.permissive = e.permissive
  ) from expected_storage_policies e
  union all
  select 'Constraint', concat(table_name, '.', constraint_type), exists (
    select 1 from information_schema.table_constraints c
    where c.table_schema = 'public' and c.table_name = e.table_name and c.constraint_type = e.constraint_type
  ) from (values ('profiles', 'FOREIGN KEY'), ('messages', 'UNIQUE'), ('assessment_attempts', 'CHECK'),
    ('learning_progress', 'UNIQUE'), ('conversations', 'FOREIGN KEY'), ('research_events', 'FOREIGN KEY')) e(table_name, constraint_type)
  union all
  select 'Policy', concat(table_name, '.', policy_name), exists (
    select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = e.table_name and p.policyname = e.policy_name
  ) from (values ('profiles', 'own_read'), ('profiles', 'own_update'), ('user_settings', 'own_update'),
    ('conversations', 'own_read'), ('messages', 'parent_owner_read'), ('courses', 'shared_read'),
    ('learning_progress', 'own_read'), ('study_materials', 'own_read'), ('research_consents', 'own_read')) e(table_name, policy_name)
  union all
  select 'Private view', 'research_export', exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'oyla_private' and c.relname = 'research_export' and c.relkind = 'v'
      and not has_table_privilege('authenticated', c.oid, 'SELECT')
  )
)
select category, object, case when ok then 'PASS' else 'FAIL' end as status
from checks order by category, object;
