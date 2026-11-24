-- Phase 04 following the guided learning migration. No schema or data rewrite.
begin;

create or replace function public.oyla_finish_guided_turn(
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

  -- The trusted API can substitute a safe practice focus for filtered final feedback.
  -- Retain the guard signal in research events even when this substitute completes the review.
  if turn.action = 'attempt' and (
    not coalesce(p_attempted, false)
    or (p_guard is not null and not (
      independent_review and p_guard in ('answer_marker', 'code_block') and p_practice is not null
    ))
  ) then
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

commit;
