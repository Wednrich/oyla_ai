-- Run in the SQL Editor of the OYLA project. Every statement is read-only.
-- Before migration: unexpected existing objects with these names must be reconciled first.
-- After migration: there should be 18 OYLA public tables with RLS enabled and two private buckets.

with expected(name) as (
  values ('profiles'), ('user_settings'), ('conversations'), ('messages'), ('courses'), ('lessons'),
    ('learning_progress'), ('practice_tasks'), ('practice_attempts'), ('assessments'), ('assessment_questions'),
    ('assessment_attempts'), ('study_materials'), ('learning_sessions'), ('research_consents'), ('research_events'),
    ('research_experiments'), ('experiment_results')
)
select expected.name, c.oid is not null as present, c.relkind, c.relrowsecurity as rls_enabled
from expected left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = expected.name
order by expected.name;

select n.nspname as schema_name, c.relname as relation, con.conname as constraint_name,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'oyla_private' or (n.nspname = 'public' and c.relname in (
  'profiles','user_settings','conversations','messages','courses','lessons','learning_progress','practice_tasks',
  'practice_attempts','assessments','assessment_questions','assessment_attempts','study_materials','learning_sessions',
  'research_consents','research_events','research_experiments','experiment_results'
))
order by schema_name, relation, constraint_name;

select schemaname, tablename, indexname, indexdef
from pg_indexes where schemaname = 'oyla_private' or indexname like 'oyla\_%'
order by schemaname, tablename, indexname;

select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'oyla_private' or (n.nspname = 'public' and left(p.proname, 5) = 'oyla_')
order by n.nspname, p.proname, arguments;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
  'profiles','user_settings','conversations','messages','courses','lessons','learning_progress','practice_tasks',
  'practice_attempts','assessments','assessment_questions','assessment_attempts','study_materials','learning_sessions',
  'research_consents','research_events','research_experiments','experiment_results'
)) or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id in ('avatars', 'study-materials') order by id;

select to_regnamespace('oyla_private') as private_schema,
       to_regclass('supabase_migrations.schema_migrations') as migration_history_relation;

-- Run the following separately only if migration_history_relation exists.
-- select version, name from supabase_migrations.schema_migrations order by version;
