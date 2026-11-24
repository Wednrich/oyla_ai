import type { LearningMode, TutorConversation } from "@/lib/tutor/modes";

export interface DashboardSummary {
  today: string;
  tasks: number;
  durationSeconds: number;
  streak: number;
  activity: { day: string; seconds: number }[];
  usage: Partial<Record<LearningMode, number>>;
  conversations: TutorConversation[];
  courses: { id: string; title: string; completed: number; total: number }[];
  assessments: { id: string; title: string; score: number; completed_at: string }[];
}

export type ActivityPeriod = "Weekly" | "Monthly";

const dayFormat = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

function dayAt(today: string, daysAgo: number) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date;
}

export function activityPoints(summary: DashboardSummary, period: ActivityPeriod) {
  const activity = new Map(summary.activity.map(({ day, seconds }) => [day, seconds]));
  const secondsAt = (date: Date) => activity.get(date.toISOString().slice(0, 10)) ?? 0;
  return Array.from({ length: period === "Weekly" ? 7 : 4 }, (_, index) => {
    const daysAgo = period === "Weekly" ? 6 - index : 27 - index * 7;
    const date = dayAt(summary.today, daysAgo);
    const seconds = period === "Weekly" ? secondsAt(date)
      : Array.from({ length: 7 }, (_, offset) => secondsAt(dayAt(summary.today, daysAgo - offset))).reduce((a, b) => a + b, 0);
    return { label: period === "Weekly" ? dayFormat.format(date) : dateFormat.format(date), minutes: Number((seconds / 60).toFixed(2)) };
  });
}
