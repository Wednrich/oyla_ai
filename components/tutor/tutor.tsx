"use client";

import { ArrowUp, Bot, MessageSquare, Plus, RotateCcw, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { GuidedActions, GuidedProgress, GuidedSetup } from "./guided-workspace";
import { guidedActionMessage, readGuidedPreferences, type GuidedAction, type GuidedLanguage, type GuidedPreferences, type GuidedSession } from "@/lib/tutor/guided";
import { Button } from "@/components/ui/button";
import { isLearningMode, isUuid, learningModes, maxPromptLength, type LearningMode, type TutorConversation, type TutorEvent, type TutorMessage } from "@/lib/tutor/modes";

interface PendingTurn { id: string; text: string; mode: LearningMode; guidedAction?: GuidedAction; preferences?: GuidedPreferences }

function pendingFrom(messages: TutorMessage[], mode: LearningMode, action?: GuidedAction): PendingTurn | null {
  const last = messages.at(-1);
  return last?.role === "user" ? { id: last.request_id, text: last.content, mode, guidedAction: action } : null;
}

async function consume(response: Response, accept: (event: TutorEvent) => void) {
  if (!response.ok || !response.body) {
    const issue = await response.json().catch(() => null);
    throw new Error(issue?.error || "Could not send the message. Try again.");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let completed = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const event = JSON.parse(line) as TutorEvent;
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "done") completed = true;
        accept(event);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!completed) throw new Error("The connection ended before the reply was saved. Retry this message.");
}

export function Tutor({ active, conversations, initialMessages, defaultMode, configured, loadError,
  initialGuide, guidedAvailable, pendingGuidedAction, defaultLanguage }: {
  active?: TutorConversation; conversations: TutorConversation[]; initialMessages: TutorMessage[];
  defaultMode: LearningMode; configured: boolean; loadError: boolean;
  initialGuide?: GuidedSession; guidedAvailable: boolean; pendingGuidedAction?: GuidedAction; defaultLanguage: GuidedLanguage;
}) {
  const router = useRouter();
  const [conversation, setConversation] = useState(active?.id);
  const [mode, setMode] = useState(active?.learning_mode ?? defaultMode);
  const [messages, setMessages] = useState(initialMessages);
  const [guide, setGuide] = useState(initialGuide);
  const [preferences, setPreferences] = useState<GuidedPreferences>({
    subject: "", topic: "", objective: "", knowledgeLevel: "beginner", language: defaultLanguage,
  });
  const [ending, setEnding] = useState(false);
  const [pending, setPending] = useState(() => initialGuide && !pendingGuidedAction ? null : pendingFrom(initialMessages, mode, pendingGuidedAction));
  const [draft, setDraft] = useState("");
  const [delta, setDelta] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const enabled = configured && !loadError;
  const starting = mode === "guided" && guidedAvailable && !conversation && !guide;
  const prefersAttempt = guide?.stage === "verify" || guide?.stage === "challenge";
  const canAttempt = Boolean(guide && ["attempt", "correct", "verify", "challenge"].includes(guide.stage) && !guide.challenge_reviewed);
  const guideClosed = Boolean(guide && guide.status !== "active");
  const settings = readGuidedPreferences(preferences);
  const composerDisabled = !enabled || busy || Boolean(pending) || guideClosed || guide?.challenge_reviewed || guide?.stage === "understand";
  const canSend = Boolean(!composerDisabled && draft.trim() && (!starting || settings));

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const pane = transcript.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [messages, delta]);

  async function send(turn: PendingTurn) {
    if (!enabled || abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    setDelta("");
    setPending(turn);
    setMessages((existing) => existing.some((item) => item.request_id === turn.id)
      ? existing : [...existing, { id: turn.id, request_id: turn.id, role: "user", content: turn.text }]);
    let answer = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: turn.id, conversationId: conversation, mode: turn.mode, message: turn.text, guidedAction: turn.guidedAction, preferences: turn.preferences }),
        signal: controller.signal,
      });
      await consume(response, (event) => {
        if (event.type === "conversation" && isUuid(event.id)) {
          setConversation(event.id);
          window.history.replaceState(null, "", `/tutor?conversation=${event.id}`);
        }
        if (event.type === "guide") setGuide(event.session);
        if (event.type === "delta") {
          answer += event.text;
          setDelta(answer);
        }
      });
      setMessages((existing) => [...existing, { id: `${turn.id}-assistant`, request_id: turn.id, role: "assistant", content: answer }]);
      setPending(null);
      router.refresh();
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not complete the response.");
    } finally {
      abort.current = null;
      setDelta("");
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitDraft(prefersAttempt ? "attempt" : "message");
  }

  function submitDraft(action: "message" | "attempt") {
    const text = draft.trim();
    if (!canSend || text.length > maxPromptLength || abort.current) return;
    setDraft("");
    void send({
      id: crypto.randomUUID(), text, mode, guidedAction: starting ? "start" : guide ? action : undefined,
      preferences: starting ? settings ?? undefined : undefined,
    });
  }

  async function endSession() {
    if (!guide || guideClosed || busy || ending) return;
    setEnding(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "guided", guidedAction: "end", conversationId: guide.conversation_id }),
      });
      const body = await response.json();
      if (!response.ok || !body.session) throw new Error(body.error || "Could not end this session. Try again.");
      setGuide(body.session);
      setPending(null);
      setDraft("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end this session. Try again.");
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="dashboard tutor-page">
      <div className="dashboard-intro"><p className="eyebrow purple-text">LEARNING WORKSPACE</p><h1>AI Tutor</h1><p>Ask a question or work through a problem in your chosen learning mode.</p></div>
      {loadError && <p className="auth-feedback" role="alert">Could not load tutor data. Confirm the Supabase migrations have been applied and reload.</p>}
      {!configured && <p className="auth-feedback" role="status">Configuration required. Set the DeepSeek API key and model, and the Supabase server key to use the tutor.</p>}
      <div className={guide ? "tutor-layout tutor-layout-guided" : "tutor-layout"}>
        <aside className="surface tutor-history">
          <Button asChild variant="outline"><Link href="/tutor"><Plus size={16} aria-hidden /> New conversation</Link></Button>
          <h2>Recent conversations</h2>
          {conversations.length ? <nav aria-label="Recent conversations">{conversations.map((entry) => (
            <Link key={entry.id} href={`/tutor?conversation=${entry.id}`} aria-current={entry.id === conversation ? "page" : undefined}>
              <MessageSquare size={15} aria-hidden /><span>{entry.title}</span>
            </Link>
          ))}</nav> : <p>Your saved conversations will appear here.</p>}
        </aside>
        <section className="surface tutor-chat" aria-labelledby="tutor-chat-title">
          <div className="tutor-chat-header">
            <h2 id="tutor-chat-title">{active?.title ?? "Tutor conversation"}</h2>
            <label>Learning mode
              <select name="mode" value={mode} disabled={Boolean(conversation || pending || busy)} onChange={(event) => {
                if (isLearningMode(event.target.value)) setMode(event.target.value);
              }}>
                {learningModes.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
            </label>
            <p>{learningModes.find(({ id }) => id === mode)?.description}{conversation && " Start a new conversation to change modes."}</p>
            {starting && <GuidedSetup preferences={preferences} onChange={setPreferences} disabled={busy || Boolean(pending)} />}
            {mode === "guided" && !guidedAvailable && <p>Structured guided sessions require the Phase 04 database update.</p>}
            {guide?.challenge && <div className="guide-challenge"><h3>Independent challenge</h3><p>{guide.challenge}</p><small>AI-generated practice. Feedback is formative and has not been objectively verified.</small></div>}
          </div>
          <div className="tutor-transcript" ref={transcript} role="region" aria-label="Conversation messages" tabIndex={0}>
            {!messages.length && <div className="tutor-welcome"><Bot size={25} aria-hidden /><p>{starting ? "Add your goal and the problem you want to work through." : "Tell OYLA what you’re working on."}</p></div>}
            {messages.map((message) => (
              <article className="tutor-message" key={message.id} data-role={message.role}>
                <strong>{message.role === "assistant" ? (guide ? "OYLA Tutor · AI feedback" : "OYLA Tutor") : "You"}</strong><p>{message.content}</p>
              </article>
            ))}
            {delta && <article className="tutor-message" data-role="assistant"><strong>OYLA Tutor</strong><p>{delta}</p></article>}
          </div>
          <div className="tutor-compose">
            {busy && <div className="tutor-retry">
              <p className="account-hint" role="status">OYLA is responding…</p>
              <Button variant="outline" size="sm" onClick={() => {
                abort.current?.abort();
                setError("Response stopped. You can retry this message.");
              }}><Square size={13} aria-hidden /> Stop response</Button>
            </div>}
            {error && <p className="auth-feedback" role="alert">{error}</p>}
            {pending && !busy && !guideClosed && <div className="tutor-retry">
              <Button variant="outline" size="sm" disabled={!enabled} onClick={() => void send(pending)}><RotateCcw size={14} /> Retry message</Button>
              {pending.guidedAction !== "start" && <Button variant="ghost" size="sm" onClick={() => { setPending(null); setError(""); }}>Continue without retrying</Button>}
            </div>}
            {guide && !guideClosed && !guide.challenge_reviewed && (
              <GuidedActions session={guide} disabled={Boolean(composerDisabled) || ending} onAction={(action) => {
                void send({ id: crypto.randomUUID(), text: guidedActionMessage[action], mode: "guided", guidedAction: action });
              }} />
            )}
            {!guideClosed && !guide?.challenge_reviewed && <form onSubmit={submit} className={starting || canAttempt ? "tutor-form-actions" : undefined}>
              <label className="sr-only" htmlFor="tutor-draft">Message OYLA</label>
              <textarea id="tutor-draft" value={draft} rows={2} placeholder={starting ? "Describe the problem you want to solve…" : prefersAttempt ? "Write your reasoning in your own words…" : "Message OYLA…"} maxLength={maxPromptLength}
                onChange={(event) => setDraft(event.target.value)} disabled={Boolean(composerDisabled) || ending} />
              <div className="tutor-send-actions">
                {canAttempt && <Button type={prefersAttempt ? "submit" : "button"} disabled={!canSend || ending}
                  onClick={prefersAttempt ? undefined : () => submitDraft("attempt")}>Submit My Attempt</Button>}
                {starting ? <Button type="submit" disabled={!canSend || ending}>Start guided session</Button>
                  : !prefersAttempt && <Button size="icon" type="submit" aria-label="Send message" disabled={!canSend || ending}><ArrowUp size={19} /></Button>}
              </div>
            </form>}
            <p className="account-hint">Messages are saved to your account and sent to DeepSeek to generate tutor responses.</p>
          </div>
        </section>
        {guide && <GuidedProgress session={guide} busy={busy} ending={ending} onEnd={() => void endSession()} />}
      </div>
    </div>
  );
}
