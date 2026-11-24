export const guidedStages = [
  { id: "understand", label: "Understand the problem" },
  { id: "assess", label: "Assess understanding" },
  { id: "attempt", label: "Try it independently" },
  { id: "hint", label: "Use a progressive hint" },
  { id: "evaluate", label: "Review your reasoning" },
  { id: "correct", label: "Correct mistakes" },
  { id: "verify", label: "Explain in your own words" },
  { id: "challenge", label: "Try a similar challenge" },
] as const;
export type GuidedStage = (typeof guidedStages)[number]["id"];

export const guidedLanguages = { en: "English", ru: "Russian", kk: "Kazakh" } as const;
export const knowledgeLevels = ["beginner", "intermediate", "advanced"] as const;
export const hintNames = ["Guiding question", "Conceptual hint", "Step-by-step guidance", "Partial worked example"] as const;
export const guidedActions = ["start", "message", "attempt", "hint", "concept", "check"] as const;
export type GuidedAction = (typeof guidedActions)[number];
export type GuidedLanguage = keyof typeof guidedLanguages;

export interface GuidedPreferences {
  subject: string;
  topic: string;
  objective: string;
  knowledgeLevel: (typeof knowledgeLevels)[number];
  language: GuidedLanguage;
}

export interface GuidedSession {
  conversation_id: string;
  subject: string;
  topic: string;
  objective: string;
  knowledge_level: GuidedPreferences["knowledgeLevel"];
  language: GuidedLanguage;
  stage: GuidedStage;
  status: "active" | "completed" | "ended_early";
  completed_stages: GuidedStage[];
  challenge: string | null;
  challenge_reviewed: boolean;
  practice_concept: string | null;
  questions: number;
  attempts: number;
  hint_requests: number;
  hints_used: number;
  started_at: string;
  ended_at: string | null;
}

export const guidedSelect = "conversation_id,subject,topic,objective,knowledge_level,language,stage,status,completed_stages,challenge,challenge_reviewed,practice_concept,questions,attempts,hint_requests,hints_used,started_at,ended_at";

export function isGuidedAction(value: unknown): value is GuidedAction {
  return guidedActions.some((action) => action === value);
}

export function isGuidedLanguage(value: unknown): value is GuidedLanguage {
  return typeof value === "string" && Object.hasOwn(guidedLanguages, value);
}

export function isKnowledgeLevel(value: unknown): value is GuidedPreferences["knowledgeLevel"] {
  return knowledgeLevels.some((level) => level === value);
}

export function readGuidedPreferences(value: unknown): GuidedPreferences | null {
  if (!value || typeof value !== "object") return null;
  const { subject, topic, objective, knowledgeLevel, language } = value as Record<string, unknown>;
  if (typeof subject !== "string" || typeof topic !== "string" || typeof objective !== "string" ||
    !isKnowledgeLevel(knowledgeLevel) || !isGuidedLanguage(language)) return null;
  const fields = { subject: subject.trim(), topic: topic.trim(), objective: objective.trim() };
  if (!fields.subject || fields.subject.length > 80 || !fields.topic || fields.topic.length > 120 ||
    !fields.objective || fields.objective.length > 360) return null;
  return { ...fields, knowledgeLevel, language };
}

export const guidedActionMessage = {
  hint: "Request a progressive hint.",
  concept: "Explain the concept behind this problem.",
  check: "Check my understanding.",
} as const;
