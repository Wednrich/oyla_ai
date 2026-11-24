import { createAdminSupabase } from "@/lib/supabase/admin";
import { publicSupabaseConfig, validServiceOrigin } from "@/lib/supabase/config";
import { verifiedUser } from "@/lib/supabase/server";
import { DeepSeekError, deepSeekConfig, streamDeepSeek, type ProviderMessage } from "@/lib/tutor/deepseek";
import { evaluateGuidedReply, guidedHistory, guidedPrompt, guardedReply, isAnswerRequest, legacyGuidedPrompt } from "@/lib/tutor/guided-coach";
import { guidedActionMessage, isGuidedAction, readGuidedPreferences, type GuidedSession } from "@/lib/tutor/guided";
import { isLearningMode, isUuid, maxPromptLength, type TutorEvent } from "@/lib/tutor/modes";

export const runtime = "nodejs";
export const maxDuration = 90;

const noStore = { "Cache-Control": "private, no-store" };
const errors: Record<string, [number, string]> = {
  invalid_input: [400, "Check your message and try again."],
  request_conflict: [409, "This request was already used for a different message."],
  request_superseded: [409, "A newer message has been sent. Start a new message to continue."],
  conversation_not_found: [404, "Conversation not found."],
  mode_conflict: [409, "Start a new conversation to switch learning modes."],
  chat_in_progress: [409, "A response is already in progress. Wait a moment and retry."],
  guided_setup_required: [409, "Start a new Guide Me session with a topic and objective."],
  guided_stage_conflict: [409, "This action is unavailable at the current stage. Reload to see the latest progress."],
  guided_ended: [409, "This learning session has ended. Start a new conversation to continue."],
  guided_hint_limit: [409, "All four hints have been used. Try submitting your own attempt."],
  chat_rate_limited: [429, "Tutor rate limit reached. Wait before sending another message."],
};

type Turn = {
  conversationId: string; cached?: string; leaseId?: string; history?: ProviderMessage[];
  guide?: GuidedSession; problem?: string; hintLevel?: number;
};

function fail(error: string, status: number) {
  return Response.json({ error }, { status, headers: noStore });
}

function databaseFailure(error: { code: string; message: string } | null, fallback: string) {
  const known = error?.code === "P0001" ? errors[error.message] : undefined;
  return known ? fail(known[1], known[0]) : fail(fallback, 503);
}

async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.split(";")[0].includes("application/json") || !request.body) return null;
  const reader = request.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    let text = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += value;
      if (text.length > 24_000) return null;
    }
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  if (!publicSupabaseConfig()) return fail("Configuration required. Connect Supabase to use the tutor.", 503);

  const origin = request.headers.get("origin");
  const site = validServiceOrigin(process.env.OYLA_SITE_URL ?? "");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin && origin !== site)) {
    return fail("Request origin is not allowed.", 403);
  }

  const auth = await verifiedUser();
  if (!auth) return fail("Sign in to use the tutor.", 401);

  const admin = createAdminSupabase();
  if (!admin) return fail("Configuration required. Set the Supabase server key.", 503);

  const body = await readBody(request);
  const conversationId = body?.conversationId;
  const requestId = body?.requestId;
  const mode = body?.mode;
  const rawAction = body?.guidedAction;
  const preferences = readGuidedPreferences(body?.preferences);
  if (rawAction === "end") {
    if (mode !== "guided" || !isUuid(conversationId)) return fail("Choose a valid guided session.", 400);
    const ended = await admin.rpc("oyla_end_guided_session", { p_user: auth.user.id, p_conversation: conversationId });
    return ended.error || !ended.data
      ? databaseFailure(ended.error, "Could not end the guided session. Check the Phase 04 migration.")
      : Response.json({ session: ended.data }, { headers: noStore });
  }

  const provider = deepSeekConfig();
  if (!provider) return fail("Configuration required. Set the DeepSeek API key and model.", 503);
  const action = isGuidedAction(rawAction) ? rawAction : null;
  if ((rawAction != null && !action) || (action && mode !== "guided") || (body?.preferences != null && (!preferences || action !== "start"))) {
    return fail("Check your guided action and learning preferences.", 400);
  }
  const prompt = action === "hint" || action === "concept" || action === "check"
    ? guidedActionMessage[action]
    : typeof body?.message === "string" ? body.message.trim() : "";
  if (!isUuid(requestId) || !isLearningMode(mode) || !prompt || prompt.length > maxPromptLength || (conversationId != null && !isUuid(conversationId))) {
    return fail("Check your message and selected learning mode.", 400);
  }

  if (mode === "guided" && !action) {
    const lookup = auth.db.from("oyla_guided_sessions").select("conversation_id");
    const session = conversationId ? await lookup.eq("conversation_id", conversationId).maybeSingle() : await lookup.limit(0);
    if (session.data && (!conversationId || !Array.isArray(session.data))) {
      return fail("Use the Guided Learning controls to start or continue this conversation.", 409);
    }
    if (session.error && !["42P01", "PGRST205"].includes(session.error.code)) return fail("Could not verify the guided session.", 503);
  }

  const { data, error } = action
    ? await admin.rpc("oyla_begin_guided_turn", {
      p_user: auth.user.id, p_request: requestId, p_conversation: conversationId ?? null,
      p_action: action, p_content: prompt, p_preferences: preferences,
    })
    : await admin.rpc("oyla_begin_chat", {
      p_user: auth.user.id, p_request: requestId, p_conversation: conversationId ?? null, p_mode: mode, p_content: prompt,
    });
  if (error || !data) return databaseFailure(error, action
    ? "Could not open the guided session. Check the Phase 04 migration and try again."
    : "Could not open the conversation. Check the Supabase migrations and try again.");

  const turn = data as Turn;
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(65_000)]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TutorEvent) => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        send({ type: "conversation", id: turn.conversationId });
        if (turn.guide) send({ type: "guide", session: turn.guide });
        if (typeof turn.cached === "string") {
          send({ type: "delta", text: turn.cached });
        } else {
          if (!turn.leaseId || !turn.history) throw new Error("Chat reservation incomplete.");
          const guide = turn.guide;
          if (guide && action && turn.problem) {
            // A guarded turn releases no provider tokens until the complete reply has been checked.
            const bypass = ["start", "message", "attempt"].includes(action) && isAnswerRequest(prompt);
            const result = bypass ? null : await streamDeepSeek({
              config: provider, mode, history: guidedHistory(turn.history), message: prompt, signal, onDelta: () => {},
              guidedInstructions: guidedPrompt(guide, action, turn.problem, turn.hintLevel),
            });
            const reviewed = result ? evaluateGuidedReply(result.content, guide.stage === "verify" && action === "attempt")
              : { guard: "answer_request" as const };
            const reply = reviewed.guard ? guardedReply[guide.language] : reviewed.reply;
            signal.throwIfAborted();
            const saved = await admin.rpc("oyla_finish_guided_turn", {
              p_user: auth.user.id, p_request: requestId, p_lease: turn.leaseId, p_content: reply,
              p_model: result?.model ?? "oyla-guided-guard", p_input: result?.input ?? null, p_output: result?.output ?? null,
              p_latency: result?.latency ?? 0, p_challenge: reviewed.guard ? null : reviewed.challenge,
              p_practice: reviewed.guard ? null : reviewed.practice, p_guard: reviewed.guard,
              p_attempted: reviewed.guard ? false : reviewed.attempted,
            });
            if (saved.error || !saved.data) {
              console.error("OYLA could not save guided turn", { code: saved.error?.code ?? "lease_expired" });
              throw new Error("Guided turn was not saved.");
            }
            send({ type: "delta", text: reply });
            send({ type: "guide", session: saved.data as GuidedSession });
          } else {
            const legacyGuide = mode === "guided";
            const result = legacyGuide && isAnswerRequest(prompt) ? null : await streamDeepSeek({
              config: provider, mode, history: legacyGuide ? guidedHistory(turn.history) : turn.history, message: prompt, signal,
              onDelta: (text) => { if (!legacyGuide) send({ type: "delta", text }); },
              guidedInstructions: legacyGuide ? legacyGuidedPrompt : undefined,
            });
            const reviewed = legacyGuide && result ? evaluateGuidedReply(result.content, false) : null;
            const reply = legacyGuide
              ? reviewed && !reviewed.guard ? reviewed.reply : guardedReply.en
              : result?.content;
            if (!reply) throw new Error("Tutor response was empty.");
            signal.throwIfAborted();
            const saved = await admin.rpc("oyla_finish_chat", {
              p_user: auth.user.id, p_request: requestId, p_lease: turn.leaseId, p_content: reply,
              p_model: result?.model ?? "oyla-guided-guard", p_input: result?.input ?? null,
              p_output: result?.output ?? null, p_latency: result?.latency ?? 0,
            });
            if (saved.error || saved.data !== true) throw new Error("Chat was not saved.");
            if (legacyGuide) send({ type: "delta", text: reply });
          }
        }
        send({ type: "done" });
      } catch (error) {
        if (!signal.aborted && error instanceof DeepSeekError) {
          console.error("OYLA tutor provider failed", { status: error.status ?? error.reason ?? "invalid_stream", mode });
        }
        if (turn.leaseId) await admin.rpc("oyla_fail_chat", { p_user: auth.user.id, p_request: requestId, p_lease: turn.leaseId });
        const message = error instanceof DeepSeekError && (error.status === 401 || error.status === 402)
          ? "DeepSeek rejected the request. Check the API key and account balance."
          : "The tutor response could not be completed and saved. Retry this message in a moment.";
        send({ type: "error", message });
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() { abort.abort(); },
  });

  return new Response(stream, {
    headers: { ...noStore, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" },
  });
}
