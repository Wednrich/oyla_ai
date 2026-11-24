import { CircleCheck, Clock3, Flame, Target } from "lucide-react";
import type { Metric } from "@/lib/learning";

const icons = { target: Target, check: CircleCheck, time: Clock3, flame: Flame };

export function CircularProgress({ value, children }: { value?: number; children: React.ReactNode }) {
  return (
    <span className="circular-progress" aria-hidden>
      <svg viewBox="0 0 48 48" width="48" height="48">
        <circle cx="24" cy="24" r="20" fill="none" stroke="var(--lavender)" strokeWidth="3.2" />
        {value !== undefined && <circle cx="24" cy="24" r="20" fill="none" stroke="var(--primary)" strokeWidth="3.2" pathLength="100"
          strokeDasharray={`${value} 100`} strokeLinecap="round" transform="rotate(-90 24 24)" />}
      </svg>
      {children}
    </span>
  );
}

export function MetricCard({ metric }: { metric: Metric }) {
  const { label, value, unit, progress, icon, experimental } = metric;
  const Icon = icons[icon];
  return (
    <article className="surface metric-card">
      <CircularProgress value={progress}><Icon size={19} strokeWidth={1.8} /></CircularProgress>
      <div className="metric-copy">
        <h3>{label}</h3>
        <p className="metric-value">{value}{unit && <span>{unit}</span>}</p>
        {experimental && <p className="experimental" title="Experimental metric · No scientific validation">Experimental · unavailable</p>}
      </div>
    </article>
  );
}
