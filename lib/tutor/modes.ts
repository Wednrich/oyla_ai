import type { GuidedSession } from "./guided";

export const learningModes = [
  { id: "socratic", label: "Explain", description: "Understand a concept through a clear explanation and example.", color: "#4D2688" },
  { id: "guided", label: "Guide Me", description: "Work through the problem with one hint at a time.", color: "#650FBF" },
  { id: "independent", label: "Quiz Me", description: "Practice with one question at a time.", color: "#8746FA" },
  { id: "review", label: "Check My Work", description: "Get feedback on a solution you’ve attempted.", color: "#A16ADB" },
  { id: "direct", label: "Direct Answer", description: "Get an explanation and worked answer.", color: "#C5A8FD" },
] as const;

export type LearningMode = (typeof learningModes)[number]["id"];

export function isLearningMode(value: unknown): value is LearningMode {
  return learningModes.some(({ id }) => id === value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export interface TutorConversation {
  id: string;
  title: string;
  learning_mode: LearningMode;
  updated_at: string;
}

export interface TutorMessage {
  id: string;
  request_id: string;
  role: "user" | "assistant";
  content: string;
}

export type TutorEvent =
  | { type: "conversation"; id: string }
  | { type: "delta"; text: string }
  | { type: "guide"; session: GuidedSession }
  | { type: "done" }
  | { type: "error"; message: string };

export const maxPromptLength = 4000;
