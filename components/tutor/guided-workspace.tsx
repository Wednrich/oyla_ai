"use client";

import { useEffect, useState } from "react";
import { BookOpen, Check, Clock3, Lightbulb, ListChecks, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  guidedLanguages, guidedStages, hintNames, isGuidedLanguage, isKnowledgeLevel, knowledgeLevels,
  type GuidedPreferences, type GuidedSession,
} from "@/lib/tutor/guided";

export function GuidedSetup({ preferences, onChange, disabled }: {
  preferences: GuidedPreferences; onChange: (preferences: GuidedPreferences) => void; disabled: boolean;
}) {
  return (
    <fieldset className="guide-setup" disabled={disabled}>
      <legend>Set up a guided session</legend>
      <label>Subject<input value={preferences.subject} maxLength={80} onChange={(e) => onChange({ ...preferences, subject: e.target.value })} placeholder="e.g. Mathematics" /></label>
      <label>Topic<input value={preferences.topic} maxLength={120} onChange={(e) => onChange({ ...preferences, topic: e.target.value })} placeholder="e.g. Linear equations" /></label>
      <label>Knowledge level<select value={preferences.knowledgeLevel} onChange={(e) => {
        if (isKnowledgeLevel(e.target.value)) onChange({ ...preferences, knowledgeLevel: e.target.value });
      }}>{knowledgeLevels.map((entry) => <option key={entry} value={entry}>{entry[0].toUpperCase() + entry.slice(1)}</option>)}</select></label>
      <label>Explanation language<select value={preferences.language} onChange={(e) => {
        if (isGuidedLanguage(e.target.value)) onChange({ ...preferences, language: e.target.value });
      }}>{Object.entries(guidedLanguages).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="guide-setup-objective">Learning objective<input value={preferences.objective} maxLength={360}
        onChange={(e) => onChange({ ...preferences, objective: e.target.value })} placeholder="e.g. Solve an equation and explain each step" /></label>
    </fieldset>
  );
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const rest = seconds % 60;
  return hours ? `${hours}h ${minutes}m ${rest}s` : `${minutes}m ${rest}s`;
}

function SessionTimer({ session }: { session: GuidedSession }) {
  const start = Date.parse(session.started_at);
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (session.ended_at) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [session.ended_at]);
  const end = session.ended_at ? Date.parse(session.ended_at) : now;
  return <span>{formatDuration(Math.max(0, Math.floor((end - start) / 1000)))}</span>;
}

const stageDirections = {
  understand: "Start with a problem you want to work through.",
  assess: "Tell OYLA what you already know or where you feel stuck.",
  attempt: "Try it yourself first. Send your reasoning with Submit My Attempt.",
  hint: "Use the smallest hint you need.",
  evaluate: "Review the tutor’s feedback on your reasoning.",
  correct: "Revise your reasoning, then check your understanding when ready.",
  verify: "Explain the concept in your own words, then submit your explanation.",
  challenge: "Try the new problem on your own and submit your reasoning.",
};

export function GuidedProgress({ session, busy, onEnd, ending }: {
  session: GuidedSession; busy: boolean; onEnd: () => void; ending: boolean;
}) {
  const [confirmEarly, setConfirmEarly] = useState(false);
  const active = session.status === "active";
  const canComplete = session.challenge_reviewed;
  const title = active ? "Learning progress" : "Session summary";
  return (
    <aside className="surface guide-progress" aria-label={title}>
      <div className="guide-progress-heading"><Target size={17} aria-hidden /><h2>{title}</h2></div>
      <div><p className="guide-kicker">{session.subject} · {guidedLanguages[session.language]}</p><h3>{session.topic}</h3><p>{session.objective}</p></div>
      <dl className="guide-metrics">
        <div><dt><Clock3 size={13} aria-hidden /> Duration</dt><dd><SessionTimer session={session} /></dd></div>
        <div><dt>Questions asked</dt><dd>{session.questions}</dd></div>
        <div><dt><Lightbulb size={13} aria-hidden /> Hints used</dt><dd>{session.hints_used} / 4</dd></div>
        <div><dt>Hint requests</dt><dd>{session.hint_requests}</dd></div>
        <div><dt>Independent attempts</dt><dd>{session.attempts}</dd></div>
      </dl>
      {active
        ? <p className="guide-stage-note" aria-live="polite">{canComplete ? "The AI reviewed your independent challenge. You can end the session." : stageDirections[session.stage]}</p>
        : <div className="guide-summary">
            <p className="guide-stage-note">{session.status === "completed" ? "Completed · independent attempt reviewed by AI" : "Ended before understanding verification was complete"}</p>
            <h3>Concepts to practice</h3>
            <p>{session.practice_concept ? `${session.practice_concept} (AI suggestion)` : "No AI practice focus was recorded."}</p>
            <h3>Recommended next step</h3>
            <p>{session.status === "completed" ? "Try a fresh problem on this topic without hints, then compare your reasoning with your course materials." : "Start a new guided session and work through the independent challenge."}</p>
          </div>}
      <div className="guide-stage-list">
        <h3><ListChecks size={15} aria-hidden /> {active ? "Learning stages" : "Completed stages"}</h3>
        <ol>
          {guidedStages.filter(({ id }) => active || session.completed_stages.includes(id)).map(({ id, label }) => (
            <li key={id} aria-current={active && session.stage === id && !canComplete ? "step" : undefined}>
              {session.completed_stages.includes(id) ? <Check size={12} aria-label="Completed" /> : <span aria-hidden />}
              {label}{id === "hint" && <small>optional</small>}
            </li>
          ))}
        </ol>
      </div>
      {active && (
        <div className="guide-end">
          {confirmEarly && !canComplete && <p>End now and save your progress as incomplete?</p>}
          <Button variant="outline" size="sm" disabled={busy || ending} onClick={() => {
            if (canComplete || confirmEarly) onEnd();
            else setConfirmEarly(true);
          }}>{ending ? "Ending…" : confirmEarly && !canComplete ? "End without completing" : "End Session"}</Button>
          {confirmEarly && !canComplete && <Button variant="ghost" size="sm" onClick={() => setConfirmEarly(false)}>Keep learning</Button>}
        </div>
      )}
    </aside>
  );
}

export function GuidedActions({ session, disabled, onAction }: {
  session: GuidedSession; disabled: boolean; onAction: (action: "hint" | "concept" | "check") => void;
}) {
  const canHint = session.stage === "attempt" || session.stage === "correct";
  const canExplain = canHint || session.stage === "verify";
  const name = hintNames[session.hints_used];
  return (
    <div className="guide-actions">
      <Button type="button" size="sm" variant="outline" disabled={disabled || !canHint || !name} onClick={() => onAction("hint")}>
        <Lightbulb size={14} aria-hidden /> {name ? `Hint ${session.hints_used + 1} · ${name}` : "All hints used"}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled || !canExplain} onClick={() => onAction("concept")}>
        <BookOpen size={14} aria-hidden /> Explain Concept
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled || session.stage !== "correct"} onClick={() => onAction("check")}>
        <ListChecks size={14} aria-hidden /> Check My Understanding
      </Button>
    </div>
  );
}
