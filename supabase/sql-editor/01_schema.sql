-- OYLA 01. Schema and fail-closed baseline. Read 00_preflight.sql first.
-- Creates empty application tables and provisions profile/settings rows for existing Auth users.
begin;

select pg_advisory_xact_lock(29870926, 14350801);

do $$
declare
  names text[] := array[
    'profiles', 'user_settings', 'conversations', 'messages', 'courses', 'lessons',
    'learning_progress', 'practice_tasks', 'practice_attempts', 'assessments',
    'assessment_questions', 'assessment_attempts', 'study_materials', 'learning_sessions',
    'research_consents', 'research_events', 'research_experiments', 'experiment_results'
  ];
  candidate text;
begin
  if to_regclass('auth.users') is null or to_regclass('storage.objects') is null
     or to_regclass('storage.buckets') is null then
    raise exception 'Expected a Supabase project with Auth and Storage installed.';
  end if;
  if to_regnamespace('oyla_private') is not null
     or to_regtype('public.oyla_learning_mode') is not null
     or to_regtype('public.oyla_difficulty') is not null then
    raise exception 'Existing OYLA schema or types detected. Inspect the installation before continuing.';
  end if;
  foreach candidate in array names loop
    if to_regclass('public.' || candidate) is not null then
      raise exception 'Existing relation public.% detected. No OYLA schema changes were made.', candidate;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('oyla_begin_chat', 'oyla_finish_chat', 'oyla_fail_chat', 'oyla_set_research_consent', 'oyla_dashboard')
  ) or exists (
    select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'oyla_initialize_user'
  ) then
    raise exception 'Existing OYLA functions or Auth trigger detected. Inspect the installation before continuing.';
  end if;
  if exists (select 1 from storage.buckets where id in ('avatars', 'study-materials')) then
    raise exception 'A required Storage bucket name is already in use. Inspect it before continuing.';
  end if;
end;
$$;

create schema oyla_private;
revoke all on schema oyla_private from public, anon, authenticated;
grant usage on schema oyla_private to service_role;

create type public.oyla_learning_mode as enum ('guided', 'independent', 'direct', 'socratic', 'review');
create type public.oyla_difficulty as enum ('beginner', 'intermediate', 'advanced');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 100),
  avatar_url text check (avatar_url like id::text || '/avatar.%' and split_part(avatar_url, '/', 3) = ''),
  university text check (length(university) <= 160),
  major text check (length(major) <= 160),
  academic_year smallint check (academic_year between 1 and 12),
  preferred_language text not null default 'en' check (preferred_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  preferred_learning_mode public.oyla_learning_mode not null default 'guided',
  notification_preferences jsonb not null default '{}' check (jsonb_typeof(notification_preferences) = 'object' and pg_column_size(notification_preferences) <= 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  learning_mode public.oyla_learning_mode not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  request_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(btrim(content)) between 1 and 24000),
  model text check (length(model) between 1 and 100),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  latency_ms integer check (latency_ms >= 0),
  created_at timestamptz not null default now(),
  unique (conversation_id, request_id, role),
  check ((role = 'assistant' and model is not null and latency_ms is not null)
    or (role = 'user' and model is null and input_tokens is null and output_tokens is null and latency_ms is null))
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null,
  category text not null,
  difficulty public.oyla_difficulty not null,
  thumbnail_url text,
  created_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  content text not null,
  position integer not null check (position > 0),
  estimated_duration integer check (estimated_duration > 0),
  created_at timestamptz not null default now(),
  unique (course_id, position)
);

create table public.learning_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id),
  check ((status = 'completed') = (completed_at is not null))
);

create table public.practice_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null,
  difficulty public.oyla_difficulty not null,
  hints jsonb not null default '[]' check (jsonb_typeof(hints) = 'array'),
  created_at timestamptz not null default now()
);

create table oyla_private.practice_solutions (
  task_id uuid primary key references public.practice_tasks (id) on delete cascade,
  solution jsonb not null
);

create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid not null references public.practice_tasks (id) on delete cascade,
  learning_mode public.oyla_learning_mode not null,
  submitted_answer text not null,
  is_correct boolean not null,
  hints_used integer not null default 0 check (hints_used >= 0),
  duration_seconds integer check (duration_seconds between 0 and 86400),
  created_at timestamptz not null default now()
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  difficulty public.oyla_difficulty not null,
  created_at timestamptz not null default now()
);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  position integer not null check (position > 0),
  unique (assessment_id, position)
);

create table oyla_private.assessment_answers (
  question_id uuid primary key references public.assessment_questions (id) on delete cascade,
  answer jsonb not null
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  score numeric(5, 2) not null check (score between 0 and 100),
  duration_seconds integer check (duration_seconds between 0 and 86400),
  completed_at timestamptz not null default now()
);

create table public.study_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  file_path text not null unique check (split_part(file_path, '/', 1) = user_id::text and split_part(file_path, '/', 2) <> ''),
  file_type text not null check (file_type = 'application/pdf'),
  file_size bigint not null check (file_size between 1 and 20971520),
  created_at timestamptz not null default now()
);

create table public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  learning_mode public.oyla_learning_mode not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds between 0 and 86400),
  unique (id, user_id),
  check ((ended_at is null) = (duration_seconds is null)),
  check (ended_at >= started_at)
);

create table public.research_consents (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  participant_id uuid unique not null default gen_random_uuid(),
  policy_version text not null check (length(policy_version) between 1 and 32),
  consented_at timestamptz not null default now(),
  unique (user_id, participant_id)
);

create table public.research_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  participant_id uuid not null,
  session_id uuid not null,
  event_type text not null check (event_type = 'tutor_turn_completed'),
  learning_mode public.oyla_learning_mode not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (user_id, participant_id) references public.research_consents (user_id, participant_id) on delete cascade,
  foreign key (session_id, user_id) references public.learning_sessions (id, user_id) on delete cascade,
  check (metadata = '{}'::jsonb)
);

create table public.research_experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  status text not null check (status in ('draft', 'active', 'complete', 'archived')),
  configuration jsonb not null default '{}' check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default now()
);

create table public.experiment_results (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.research_experiments (id) on delete cascade,
  learning_mode public.oyla_learning_mode not null,
  model text not null,
  data_origin text not null check (data_origin in ('demo', 'synthetic', 'real')),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  created_at timestamptz not null default now()
);

create index oyla_conversations_recent on public.conversations (user_id, updated_at desc, id);
create index oyla_messages_order on public.messages (conversation_id, created_at desc, id);
create index oyla_progress_lesson on public.learning_progress (lesson_id);
create index oyla_practice_attempts_user on public.practice_attempts (user_id, created_at desc);
create index oyla_practice_attempts_task on public.practice_attempts (task_id);
create index oyla_assessment_attempts_user on public.assessment_attempts (user_id, completed_at desc);
create index oyla_assessment_attempts_assessment on public.assessment_attempts (assessment_id);
create index oyla_study_materials_user on public.study_materials (user_id);
create index oyla_learning_sessions_user on public.learning_sessions (user_id, started_at desc);
create index oyla_research_events_user on public.research_events (user_id, participant_id);
create index oyla_research_events_session on public.research_events (session_id, user_id);
create index oyla_experiment_results_experiment on public.experiment_results (experiment_id);

create function oyla_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger oyla_profiles_updated before update on public.profiles for each row execute function oyla_private.touch_updated_at();
create trigger oyla_settings_updated before update on public.user_settings for each row execute function oyla_private.touch_updated_at();
create trigger oyla_conversations_updated before update on public.conversations for each row execute function oyla_private.touch_updated_at();
create trigger oyla_progress_updated before update on public.learning_progress for each row execute function oyla_private.touch_updated_at();

create function oyla_private.initialize_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100))
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger oyla_initialize_user after insert on auth.users
for each row execute function oyla_private.initialize_user();

insert into public.profiles (id, full_name)
select id, left(btrim(coalesce(raw_user_meta_data ->> 'full_name', '')), 100) from auth.users
on conflict (id) do nothing;
insert into public.user_settings (user_id) select id from public.profiles on conflict (user_id) do nothing;

create table oyla_private.chat_requests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null,
  conversation_id uuid not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  lease_id uuid not null,
  started_at timestamptz not null,
  primary key (user_id, request_id),
  foreign key (conversation_id, user_id) references public.conversations (id, user_id) on delete cascade
);
create index oyla_chat_requests_conversation on oyla_private.chat_requests (conversation_id, user_id, status, started_at);

create table oyla_private.chat_rate_events (
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default clock_timestamp()
);
create index oyla_chat_rate_user_time on oyla_private.chat_rate_events (user_id, started_at desc);

-- Supabase project defaults can grant client roles access to new public objects.
do $$
declare
  item text;
begin
  foreach item in array array[
    'profiles', 'user_settings', 'conversations', 'messages', 'courses', 'lessons',
    'learning_progress', 'practice_tasks', 'practice_attempts', 'assessments',
    'assessment_questions', 'assessment_attempts', 'study_materials', 'learning_sessions',
    'research_consents', 'research_events', 'research_experiments', 'experiment_results'
  ] loop
    execute format('alter table public.%I enable row level security', item);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', item);
  end loop;
end;
$$;

alter table oyla_private.practice_solutions enable row level security;
alter table oyla_private.assessment_answers enable row level security;
alter table oyla_private.chat_requests enable row level security;
alter table oyla_private.chat_rate_events enable row level security;
revoke all on all tables in schema oyla_private from public, anon, authenticated;
revoke all on all functions in schema oyla_private from public, anon, authenticated;

commit;
