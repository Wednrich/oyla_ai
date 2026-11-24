-- OYLA 02. Security, RPCs, private buckets, and the read-only research export.
-- Run only after 01_schema.sql succeeds.
begin;

select pg_advisory_xact_lock(29870926, 14350801);

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('oyla_private.chat_requests') is null then
    raise exception 'Run 01_schema.sql before 02_security.sql.';
  end if;
  if exists (select 1 from storage.buckets where id in ('avatars', 'study-materials')) then
    raise exception 'A required bucket already exists. Review the existing installation before continuing.';
  end if;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'user_settings', 'conversations', 'messages', 'courses', 'lessons', 'learning_progress',
    'practice_tasks', 'practice_attempts', 'assessments', 'assessment_questions', 'assessment_attempts',
    'study_materials', 'learning_sessions', 'research_consents', 'research_events', 'research_experiments', 'experiment_results'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;

  foreach t in array array[
    'user_settings', 'conversations', 'learning_progress', 'practice_attempts', 'assessment_attempts',
    'study_materials', 'learning_sessions', 'research_consents'
  ] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy own_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;

  foreach t in array array['courses', 'lessons', 'practice_tasks', 'assessments', 'assessment_questions'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy shared_read on public.%I for select to authenticated using (true)', t);
  end loop;
end;
$$;

grant select on public.profiles, public.messages to authenticated;
grant update (full_name, university, major, academic_year, preferred_language) on public.profiles to authenticated;
grant update (theme, preferred_learning_mode, notification_preferences) on public.user_settings to authenticated;

create policy own_read on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy own_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy own_update on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy parent_owner_read on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
  ));

alter table oyla_private.practice_solutions enable row level security;
alter table oyla_private.assessment_answers enable row level security;
revoke all on all tables in schema oyla_private from public, anon, authenticated;
revoke all on all functions in schema oyla_private from public, anon, authenticated;
grant select, insert, update, delete on oyla_private.practice_solutions, oyla_private.assessment_answers to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('study-materials', 'study-materials', false, 20971520, array['application/pdf']);

create policy oyla_private_file_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('avatars', 'study-materials')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter table oyla_private.chat_requests enable row level security;
alter table oyla_private.chat_rate_events enable row level security;
revoke all on oyla_private.chat_requests, oyla_private.chat_rate_events from public, anon, authenticated;
grant select, insert, update, delete on oyla_private.chat_requests, oyla_private.chat_rate_events to service_role;

create function public.oyla_begin_chat(
  p_user uuid, p_request uuid, p_conversation uuid, p_mode public.oyla_learning_mode, p_content text
)
returns jsonb language plpgsql set search_path = '' as $$
declare
  turn oyla_private.chat_requests%rowtype;
  thread public.conversations%rowtype;
  attempt uuid := gen_random_uuid();
  started timestamptz;
  previous_content text;
  history jsonb;
begin
  if p_user is null or p_request is null or p_mode is null or p_content is null or length(btrim(p_content)) not between 1 and 4000 then
    raise exception 'invalid_input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 812214));
  started := clock_timestamp();

  select * into turn from oyla_private.chat_requests where user_id = p_user and request_id = p_request;
  if found then
    select * into strict thread from public.conversations where id = turn.conversation_id and user_id = p_user;
    select content into previous_content from public.messages
      where conversation_id = thread.id and request_id = p_request and role = 'user';
    if (p_conversation is not null and p_conversation <> thread.id)
      or p_mode <> thread.learning_mode or previous_content is distinct from p_content then
      raise exception 'request_conflict';
    end if;
    if turn.status = 'completed' then
      return jsonb_build_object(
        'conversationId', thread.id,
        'cached', (select content from public.messages where conversation_id = thread.id and request_id = p_request and role = 'assistant')
      );
    end if;
  elsif p_conversation is not null then
    select * into thread from public.conversations where id = p_conversation and user_id = p_user;
    if not found then raise exception 'conversation_not_found'; end if;
    if thread.learning_mode <> p_mode then raise exception 'mode_conflict'; end if;
  end if;

  if thread.id is not null and exists (
    select 1 from oyla_private.chat_requests r
    where r.conversation_id = thread.id and r.user_id = p_user
      and r.status = 'processing' and r.started_at > started - interval '2 minutes'
  ) then
    raise exception 'chat_in_progress';
  end if;

  if turn.request_id is not null and exists (
    select 1 from public.messages
    where conversation_id = thread.id and role = 'user' and request_id <> p_request
      and created_at > (select created_at from public.messages where conversation_id = thread.id and request_id = p_request and role = 'user')
  ) then
    raise exception 'request_superseded';
  end if;

  delete from oyla_private.chat_rate_events where user_id = p_user and started_at < started - interval '1 day';
  if (select count(*) from oyla_private.chat_rate_events where user_id = p_user) >= 80
    or (select count(*) from oyla_private.chat_rate_events where user_id = p_user and started_at >= started - interval '1 minute') >= 10 then
    raise exception 'chat_rate_limited';
  end if;
  insert into oyla_private.chat_rate_events (user_id, started_at) values (p_user, started);

  if thread.id is null then
    insert into public.conversations (user_id, title, learning_mode)
    values (p_user, left(regexp_replace(btrim(p_content), '[[:space:]]+', ' ', 'g'), 90), p_mode)
    returning * into thread;
  end if;

  insert into oyla_private.chat_requests (user_id, request_id, conversation_id, status, lease_id, started_at)
  values (p_user, p_request, thread.id, 'processing', attempt, started)
  on conflict (user_id, request_id) do update set status = excluded.status, lease_id = excluded.lease_id, started_at = excluded.started_at;

  insert into public.messages (conversation_id, request_id, role, content)
  values (thread.id, p_request, 'user', p_content)
  on conflict (conversation_id, request_id, role) do nothing;

  update public.conversations set updated_at = started where id = thread.id and user_id = p_user;

  select coalesce(jsonb_agg(jsonb_build_object('role', h.role, 'content', h.content) order by h.created_at, h.id), '[]'::jsonb)
  into history
  from (
    select m.id, m.role, m.content, m.created_at
    from public.messages m
    join oyla_private.chat_requests r on r.user_id = p_user and r.request_id = m.request_id and r.conversation_id = m.conversation_id
    where m.conversation_id = thread.id and r.status = 'completed'
    order by m.created_at desc, m.id desc
    limit 20
  ) h;

  return jsonb_build_object('conversationId', thread.id, 'leaseId', attempt, 'history', history);
end;
$$;

create function public.oyla_finish_chat(
  p_user uuid, p_request uuid, p_lease uuid, p_content text, p_model text,
  p_input integer, p_output integer, p_latency integer
)
returns boolean language plpgsql set search_path = '' as $$
declare
  turn oyla_private.chat_requests%rowtype;
  mode public.oyla_learning_mode;
  session_id uuid;
  recorded_end timestamptz;
  participant uuid;
begin
  select * into turn from oyla_private.chat_requests
  where user_id = p_user and request_id = p_request and lease_id = p_lease
    and status = 'processing' and started_at > clock_timestamp() - interval '2 minutes'
  for update;
  if not found then return false; end if;

  select learning_mode into strict mode from public.conversations where id = turn.conversation_id and user_id = p_user;
  insert into public.messages (conversation_id, request_id, role, content, model, input_tokens, output_tokens, latency_ms)
  values (turn.conversation_id, p_request, 'assistant', p_content, p_model, p_input, p_output, p_latency);

  update oyla_private.chat_requests set status = 'completed' where user_id = p_user and request_id = p_request;
  update public.conversations set updated_at = clock_timestamp() where id = turn.conversation_id and user_id = p_user;

  recorded_end := clock_timestamp();
  insert into public.learning_sessions (user_id, learning_mode, started_at, ended_at, duration_seconds)
  values (p_user, mode, turn.started_at, recorded_end, greatest(0, round(extract(epoch from recorded_end - turn.started_at))::integer))
  returning id into session_id;

  select participant_id into participant from public.research_consents where user_id = p_user for key share;
  if found then
    insert into public.research_events (user_id, participant_id, session_id, event_type, learning_mode)
    values (p_user, participant, session_id, 'tutor_turn_completed', mode);
  end if;

  return true;
end;
$$;

create function public.oyla_fail_chat(p_user uuid, p_request uuid, p_lease uuid)
returns void language sql set search_path = '' as $$
  update oyla_private.chat_requests set status = 'failed'
  where user_id = p_user and request_id = p_request and lease_id = p_lease and status = 'processing';
$$;

create function public.oyla_set_research_consent(p_user uuid, p_enabled boolean)
returns void language plpgsql set search_path = '' as $$
begin
  if p_enabled then
    insert into public.research_consents (user_id, policy_version)
    values (p_user, '2026-11-v1') on conflict (user_id) do nothing;
  else
    delete from public.research_consents where user_id = p_user;
  end if;
end;
$$;

revoke all on function public.oyla_begin_chat(uuid, uuid, uuid, public.oyla_learning_mode, text) from public, anon, authenticated;
revoke all on function public.oyla_finish_chat(uuid, uuid, uuid, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.oyla_fail_chat(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.oyla_set_research_consent(uuid, boolean) from public, anon, authenticated;
grant execute on function public.oyla_begin_chat(uuid, uuid, uuid, public.oyla_learning_mode, text) to service_role;
grant execute on function public.oyla_finish_chat(uuid, uuid, uuid, text, text, integer, integer, integer) to service_role;
grant execute on function public.oyla_fail_chat(uuid, uuid, uuid) to service_role;
grant execute on function public.oyla_set_research_consent(uuid, boolean) to service_role;

create view oyla_private.research_export with (security_invoker = true) as
select participant_id, event_type, learning_mode, (created_at at time zone 'UTC')::date as event_date, 'real'::text as data_origin
from public.research_events;
revoke all on oyla_private.research_export from public, anon, authenticated;
grant select on oyla_private.research_export to service_role;

create function public.oyla_dashboard()
returns jsonb language sql stable set search_path = '' as $$
  with identity as (
    select (select auth.uid()) as user_id, (now() at time zone 'UTC')::date as today
  ), tutor as (
    select s.learning_mode, s.duration_seconds, (s.ended_at at time zone 'UTC')::date as day
    from public.learning_sessions s, identity i where s.user_id = i.user_id and s.ended_at is not null
  ), practice as (
    select p.task_id, p.is_correct, p.duration_seconds, (p.created_at at time zone 'UTC')::date as day
    from public.practice_attempts p, identity i where p.user_id = i.user_id
  ), assessment as (
    select a.id, a.assessment_id, a.score, a.completed_at, a.duration_seconds,
      (a.completed_at at time zone 'UTC')::date as day
    from public.assessment_attempts a, identity i where a.user_id = i.user_id
  ), progress as (
    select p.status, l.course_id, (p.updated_at at time zone 'UTC')::date as day
    from public.learning_progress p join public.lessons l on p.lesson_id = l.id, identity i where p.user_id = i.user_id
  ), timed as (
    select day, duration_seconds from tutor
    union all select day, duration_seconds from practice
    union all select day, duration_seconds from assessment
  ), days as (
    select day from timed
    union select day from progress
  ), streak as (
    select day, row_number() over (order by day desc) as gap from days, identity i where day <= i.today
  ), counts as (
    select course_id, count(*) filter (where status = 'completed') as completed from progress group by course_id
  )
  select jsonb_build_object(
    'today', i.today,
    'tasks', (select count(distinct task_id) from practice where is_correct),
    'durationSeconds', (select coalesce(sum(duration_seconds), 0) from timed),
    'streak', (select count(*) from streak where day + gap::integer - 1 =
      i.today - case when exists (select 1 from days where day = i.today) then 0 else 1 end),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('day', x.day, 'seconds', x.seconds)) from (
      select day, coalesce(sum(duration_seconds), 0) as seconds from timed where day between i.today - 27 and i.today group by day
    ) x), '[]'::jsonb),
    'usage', coalesce((select jsonb_object_agg(x.learning_mode, x.turns) from (
      select learning_mode, count(*) as turns from tutor group by learning_mode
    ) x), '{}'::jsonb),
    'conversations', coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc, x.id) from (
      select id, title, learning_mode, updated_at from public.conversations where user_id = i.user_id order by updated_at desc, id limit 4
    ) x), '[]'::jsonb),
    'courses', coalesce((select jsonb_agg(to_jsonb(x) order by x.title, x.id) from (
      select c.id, c.title, counts.completed, (select count(*) from public.lessons where course_id = c.id) as total
      from counts join public.courses c on c.id = counts.course_id order by c.title, c.id limit 12
    ) x), '[]'::jsonb),
    'assessments', coalesce((select jsonb_agg(to_jsonb(x) order by x.completed_at desc, x.id) from (
      select a.id, b.title, a.score, a.completed_at from assessment a join public.assessments b on b.id = a.assessment_id
      order by completed_at desc, a.id limit 5
    ) x), '[]'::jsonb)
  )
  from identity i where i.user_id is not null;
$$;

revoke all on function public.oyla_dashboard() from public, anon, authenticated;
grant execute on function public.oyla_dashboard() to authenticated;

-- Restrictive policies constrain older permissive policies only inside the two OYLA buckets.
create policy oyla_storage_owner_boundary on storage.objects
  as restrictive for select to public
  using (
    bucket_id not in ('avatars', 'study-materials')
    or (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy oyla_storage_server_insert on storage.objects
  as restrictive for insert to public
  with check (bucket_id not in ('avatars', 'study-materials'));

create policy oyla_storage_server_update on storage.objects
  as restrictive for update to public
  using (bucket_id not in ('avatars', 'study-materials'))
  with check (bucket_id not in ('avatars', 'study-materials'));

create policy oyla_storage_server_delete on storage.objects
  as restrictive for delete to public
  using (bucket_id not in ('avatars', 'study-materials'));

-- Restrict this user-context RPC even if project defaults grant service_role execution.
revoke execute on function public.oyla_dashboard() from service_role;

commit;
