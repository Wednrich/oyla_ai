-- Phase 04 only. Requires the existing OYLA foundation and services.
begin;

create table public.oyla_guided_sessions (
  conversation_id uuid primary key,
  user_id uuid not null,
  subject text not null check (length(btrim(subject)) between 1 and 80),
  topic text not null check (length(btrim(topic)) between 1 and 120),
  objective text not null check (length(btrim(objective)) between 1 and 360),
  knowledge_level text not null check (knowledge_level in ('beginner', 'intermediate', 'advanced')),
  language text not null check (language in ('en', 'ru', 'kk')),
  problem text not null check (length(btrim(problem)) between 1 and 4000),
  stage text not null default 'understand' check (stage in ('understand', 'assess', 'attempt', 'correct', 'verify', 'challenge')),
  status text not null default 'active' check (status in ('active', 'completed', 'ended_early')),
  completed_stages text[] not null default '{}' check (
    completed_stages <@ array['understand', 'assess', 'attempt', 'hint', 'evaluate', 'correct', 'verify', 'challenge']
  ),
  challenge text check (length(btrim(challenge)) between 1 and 1200),
  challenge_reviewed boolean not null default false check (not challenge_reviewed or challenge is not null),
  practice_concept text check (length(btrim(practice_concept)) between 1 and 180),
  questions integer not null default 0 check (questions >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  hint_requests integer not null default 0 check (hint_requests >= 0),
  hints_used integer not null default 0 check (hints_used between 0 and 4 and hints_used <= hint_requests),
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz check (ended_at >= started_at),
  check ((status = 'active') = (ended_at is null)),
  check (status <> 'completed' or challenge_reviewed),
  foreign key (conversation_id, user_id) references public.conversations (id, user_id) on delete cascade,
  unique (conversation_id, user_id)
);
create index oyla_guided_sessions_owner on public.oyla_guided_sessions (user_id, conversation_id);

create table public.oyla_guided_turns (
  user_id uuid not null,
  request_id uuid not null,
  conversation_id uuid not null,
  action text not null check (action in ('start', 'message', 'attempt', 'hint', 'concept', 'check')),
  stage_before text not null,
  hint_level integer check (hint_level between 1 and 4),
  primary key (user_id, request_id),
  foreign key (conversation_id, user_id) references public.oyla_guided_sessions (conversation_id, user_id) on delete cascade,
  foreign key (user_id, request_id) references oyla_private.chat_requests (user_id, request_id) on delete cascade,
  check ((action = 'hint') = (hint_level is not null))
);
create index oyla_guided_turns_session on public.oyla_guided_turns (conversation_id, user_id);

alter table public.oyla_guided_sessions enable row level security;
alter table public.oyla_guided_turns enable row level security;
revoke all on public.oyla_guided_sessions, public.oyla_guided_turns from public, anon, authenticated, service_role;
grant select on public.oyla_guided_sessions, public.oyla_guided_turns to authenticated;
grant select, insert, update on public.oyla_guided_sessions, public.oyla_guided_turns to service_role;
create policy own_read on public.oyla_guided_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy own_read on public.oyla_guided_turns for select to authenticated using (user_id = (select auth.uid()));

create table oyla_private.guided_research_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  participant_id uuid not null,
  session_id uuid not null,
  event_type text not null check (event_type in ('turn_requested', 'turn_completed', 'session_ended')),
  stage_before text not null,
  stage_after text not null,
  action text,
  hint_level integer check (hint_level between 1 and 4),
  independent_task_completed boolean,
  verified_correctness boolean,
  model text check (length(model) between 1 and 100),
  guard_signal text check (guard_signal in ('answer_request', 'answer_marker', 'code_block', 'malformed_response')),
  duration_seconds integer check (duration_seconds >= 0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (user_id, participant_id) references public.research_consents (user_id, participant_id) on delete cascade
);
create index oyla_guided_research_owner on oyla_private.guided_research_events (user_id, participant_id);
alter table oyla_private.guided_research_events enable row level security;
revoke all on oyla_private.guided_research_events from public, anon, authenticated, service_role;
grant select, insert on oyla_private.guided_research_events to service_role;

-- Scoped to the consent in force when the event occurs. No lesson text or user input belongs here.
create function oyla_private.log_guided_event(
  p_session public.oyla_guided_sessions, p_event text, p_before text, p_action text,
  p_hint integer, p_model text, p_guard text, p_independent boolean default null
)
returns void language plpgsql set search_path = '' as $$
declare
  consent public.research_consents%rowtype;
begin
  select * into consent from public.research_consents
    where user_id = p_session.user_id and policy_version = '2026-11-v2' for key share;
  if not found then return; end if;
  insert into oyla_private.guided_research_events (
    user_id, participant_id, session_id, event_type, stage_before, stage_after, action,
    hint_level, independent_task_completed, model, guard_signal, duration_seconds
  )
  values (
    p_session.user_id, consent.participant_id, p_session.conversation_id, p_event, p_before, p_session.stage,
    p_action, p_hint, p_independent, p_model, p_guard,
    case when p_event = 'session_ended' and consent.consented_at <= p_session.started_at
      then floor(extract(epoch from p_session.ended_at - p_session.started_at))::integer end
  );
end;
$$;

-- The export derives a session pseudonym from the private session ID and the consent ID.
create view oyla_private.guided_research_export with (security_invoker = true) as
select participant_id,
       encode(sha256(convert_to(participant_id::text || ':' || session_id::text, 'UTF8')), 'hex') as session_pseudonym,
       'guided'::text as learning_mode, 'real'::text as data_origin, event_type, stage_before, stage_after,
       action, (action = 'attempt' and event_type = 'turn_requested')::integer as attempt_count,
       hint_level, independent_task_completed, verified_correctness, model, guard_signal, duration_seconds,
       (created_at at time zone 'UTC')::date as event_date
from oyla_private.guided_research_events;
revoke all on oyla_private.guided_research_export from public, anon, authenticated, service_role;
grant select on oyla_private.guided_research_export to service_role;

create function public.oyla_begin_guided_turn(
  p_user uuid, p_request uuid, p_conversation uuid, p_action text, p_content text, p_preferences jsonb
)
returns jsonb language plpgsql set search_path = '' as $$
declare
  session public.oyla_guided_sessions%rowtype;
  prior public.oyla_guided_turns%rowtype;
  reservation jsonb;
  hint integer;
begin
  if p_user is null or p_request is null or p_action is null
    or p_action not in ('start', 'message', 'attempt', 'hint', 'concept', 'check') then
    raise exception 'invalid_input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 812214));
  select * into prior from public.oyla_guided_turns where user_id = p_user and request_id = p_request;
  if prior.request_id is not null and p_action <> prior.action then raise exception 'request_conflict'; end if;

  select * into session from public.oyla_guided_sessions
    where conversation_id = coalesce(prior.conversation_id, p_conversation) and user_id = p_user;

  if p_preferences is not null and session.conversation_id is not null and p_preferences is distinct from
    jsonb_build_object('subject', session.subject, 'topic', session.topic, 'objective', session.objective,
      'knowledgeLevel', session.knowledge_level, 'language', session.language) then
    raise exception 'request_conflict';
  end if;

  if prior.request_id is null then
    if session.conversation_id is null then
      if p_action <> 'start' or p_conversation is not null or p_preferences is null then
        raise exception 'guided_setup_required';
      end if;
    else
      if session.status <> 'active' then raise exception 'guided_ended'; end if;
      if not (
        (session.stage = 'assess' and p_action = 'message')
        or (session.stage in ('attempt', 'correct') and p_action in ('message', 'attempt', 'concept', 'hint'))
        or (session.stage = 'correct' and p_action = 'check')
        or (session.stage = 'verify' and p_action in ('attempt', 'concept'))
        or (session.stage = 'challenge' and not session.challenge_reviewed and p_action = 'attempt')
      ) then raise exception 'guided_stage_conflict'; end if;
      if p_action = 'hint' and session.hints_used >= 4 then raise exception 'guided_hint_limit'; end if;
    end if;
  elsif session.status <> 'active' and not exists (
    select 1 from oyla_private.chat_requests where user_id = p_user and request_id = p_request and status = 'completed'
  ) then
    raise exception 'guided_ended';
  end if;

  -- Reserve using the existing owner checks, rate limit, retry lease, and message history.
  reservation := public.oyla_begin_chat(p_user, p_request, p_conversation, 'guided', p_content);
  if reservation ? 'cached' then
    return reservation || jsonb_build_object('guide', to_jsonb(session) - 'user_id' - 'problem');
  end if;
  if session.conversation_id is null then
    insert into public.oyla_guided_sessions (
      conversation_id, user_id, subject, topic, objective, knowledge_level, language, problem
    )
    values ((reservation->>'conversationId')::uuid, p_user, p_preferences->>'subject', p_preferences->>'topic',
      p_preferences->>'objective', p_preferences->>'knowledgeLevel', p_preferences->>'language', p_content)
    returning * into session;
    update public.conversations set title = session.topic where id = session.conversation_id and user_id = p_user;
  end if;

  if prior.request_id is null then
    hint := case when p_action = 'hint' then session.hints_used + 1 end;
    insert into public.oyla_guided_turns (user_id, request_id, conversation_id, action, stage_before, hint_level)
    values (p_user, p_request, session.conversation_id, p_action, session.stage, hint)
    returning * into prior;

    update public.oyla_guided_sessions
    set questions = questions + case when p_action in ('start', 'message', 'attempt') and p_content ~ '[?？]' then 1 else 0 end,
        attempts = attempts + (p_action = 'attempt' and session.stage <> 'verify')::integer,
        hint_requests = hint_requests + (p_action = 'hint')::integer
    where conversation_id = session.conversation_id and user_id = p_user
    returning * into session;
    perform oyla_private.log_guided_event(session, 'turn_requested', session.stage,
      case when p_action = 'attempt' and session.stage = 'verify' then 'restatement' else p_action end,
      hint, null, null);
  elsif prior.stage_before <> session.stage or (prior.hint_level is not null and prior.hint_level <> session.hints_used + 1) then
    raise exception 'request_superseded';
  end if;

  return reservation || jsonb_build_object('guide', to_jsonb(session) - 'user_id' - 'problem',
    'problem', session.problem, 'hintLevel', prior.hint_level);
end;
$$;

create function public.oyla_finish_guided_turn(
  p_user uuid, p_request uuid, p_lease uuid, p_content text, p_model text,
  p_input integer, p_output integer, p_latency integer, p_challenge text, p_practice text, p_guard text, p_attempted boolean
)
returns jsonb language plpgsql set search_path = '' as $$
declare
  turn public.oyla_guided_turns%rowtype;
  session public.oyla_guided_sessions%rowtype;
  next_stage text;
  done_stages text[] := '{}';
  independent_review boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 812214));
  select * into turn from public.oyla_guided_turns where user_id = p_user and request_id = p_request;
  if not found then return null; end if;

  select * into session from public.oyla_guided_sessions where conversation_id = turn.conversation_id and user_id = p_user;
  if session.status <> 'active' or session.stage <> turn.stage_before then return null; end if;

  next_stage := session.stage;
  independent_review := turn.action = 'attempt' and session.stage = 'challenge';

  if turn.action = 'start' then
    next_stage := 'assess';
    done_stages := array['understand'];
  elsif session.stage = 'assess' and p_guard is null then
    next_stage := 'attempt';
    done_stages := array['assess'];
  elsif turn.action = 'hint' then
    if turn.hint_level <> session.hints_used + 1 then return null; end if;
    if p_guard is null then done_stages := array['hint']; end if;
  elsif turn.action = 'attempt' and session.stage = 'attempt' then
    next_stage := 'correct';
    done_stages := array['attempt', 'evaluate'];
  elsif turn.action = 'check' and p_guard is null then
    next_stage := 'verify';
    done_stages := array['correct'];
  elsif turn.action = 'attempt' and session.stage = 'verify' then
    if p_attempted and p_guard is null and p_challenge is null then return null; end if;
    next_stage := 'challenge';
    done_stages := array['verify'];
  elsif independent_review then
    if session.challenge_reviewed then return null; end if;
    done_stages := array['challenge'];
  end if;

  -- A blocked attempt can be retried with revised input without completing the stage.
  if turn.action = 'attempt' and (p_guard is not null or not coalesce(p_attempted, false)) then
    next_stage := session.stage;
    done_stages := '{}';
    independent_review := false;
  end if;

  if not public.oyla_finish_chat(p_user, p_request, p_lease, p_content, p_model, p_input, p_output, p_latency) then
    return null;
  end if;

  update public.oyla_guided_sessions
  set stage = next_stage,
      completed_stages = completed_stages || array(select s from unnest(done_stages) as s where not s = any(session.completed_stages)),
      hints_used = hints_used + (turn.action = 'hint' and p_guard is null)::integer,
      challenge = case when next_stage = 'challenge' and session.stage = 'verify' then p_challenge else challenge end,
      practice_concept = case when independent_review then p_practice else practice_concept end,
      challenge_reviewed = challenge_reviewed or independent_review
  where conversation_id = session.conversation_id and user_id = p_user returning * into session;

  perform oyla_private.log_guided_event(session, 'turn_completed', turn.stage_before, turn.action,
    turn.hint_level, case when p_guard = 'answer_request' then null else p_model end, p_guard,
    case when turn.stage_before = 'challenge' then independent_review end);
  return to_jsonb(session) - 'user_id' - 'problem';
end;
$$;

create function public.oyla_end_guided_session(p_user uuid, p_conversation uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  session public.oyla_guided_sessions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 812214));
  select * into session from public.oyla_guided_sessions where conversation_id = p_conversation and user_id = p_user;
  if not found then raise exception 'conversation_not_found'; end if;

  if session.status = 'active' then
    if exists (
      select 1 from oyla_private.chat_requests where conversation_id = p_conversation and user_id = p_user
        and status = 'processing' and started_at > clock_timestamp() - interval '2 minutes'
    ) then raise exception 'chat_in_progress'; end if;

    update public.oyla_guided_sessions set ended_at = clock_timestamp(),
      status = case when challenge_reviewed then 'completed' else 'ended_early' end
    where conversation_id = p_conversation and user_id = p_user returning * into session;
    perform oyla_private.log_guided_event(session, 'session_ended', session.stage, null, null, null, null, session.challenge_reviewed);
  end if;
  return to_jsonb(session) - 'user_id' - 'problem';
end;
$$;

-- Existing opt-ins continue to cover their original data. The student re-confirms Phase 04 metrics.
create or replace function public.oyla_set_research_consent(p_user uuid, p_enabled boolean)
returns void language plpgsql set search_path = '' as $$
begin
  if p_enabled then
    insert into public.research_consents (user_id, policy_version, consented_at)
    values (p_user, '2026-11-v2', clock_timestamp())
    on conflict (user_id) do update
    set policy_version = excluded.policy_version, consented_at = excluded.consented_at
    where public.research_consents.policy_version <> excluded.policy_version;
  else
    delete from public.research_consents where user_id = p_user;
  end if;
end;
$$;

revoke all on function oyla_private.log_guided_event(public.oyla_guided_sessions, text, text, text, integer, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function oyla_private.log_guided_event(public.oyla_guided_sessions, text, text, text, integer, text, text, boolean) to service_role;
revoke all on function public.oyla_begin_guided_turn(uuid, uuid, uuid, text, text, jsonb),
  public.oyla_finish_guided_turn(uuid, uuid, uuid, text, text, integer, integer, integer, text, text, text, boolean),
  public.oyla_end_guided_session(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.oyla_begin_guided_turn(uuid, uuid, uuid, text, text, jsonb),
  public.oyla_finish_guided_turn(uuid, uuid, uuid, text, text, integer, integer, integer, text, text, text, boolean),
  public.oyla_end_guided_session(uuid, uuid) to service_role;

commit;
