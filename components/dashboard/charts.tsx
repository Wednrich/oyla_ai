"use client";

import { ChevronDown } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { activityPoints, type ActivityPeriod, type DashboardSummary } from "@/lib/dashboard";
import { learningModes } from "@/lib/tutor/modes";

export function LearningActivityChart({ summary }: { summary: DashboardSummary | null }) {
  const [period, setPeriod] = useState<ActivityPeriod>("Weekly");
  const reduceMotion = useReducedMotion();
  const gradient = useId();
  const points = summary?.activity.length ? activityPoints(summary, period) : null;

  return (
    <section className="surface chart-card" aria-labelledby="activity-title">
      <div className="chart-heading">
        <div><h2 id="activity-title">Learning Activity</h2><p>Recorded tutor, practice, and assessment time · UTC</p></div>
        <label className="period-select">
          <span className="sr-only">Activity period</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value as ActivityPeriod)}>
            <option>Weekly</option><option>Monthly</option>
          </select>
          <ChevronDown size={14} aria-hidden />
        </label>
      </div>
      {points ? <>
      <span className="sr-only" aria-live="polite">{period} learning activity. {points.map(({ label, minutes }) => `${label}: ${minutes} minutes`).join(", ")}.</span>
      <div className="activity-chart">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 340, height: 158 }}>
          <AreaChart data={points} margin={{ top: 10, right: 14, bottom: 0, left: 0 }} accessibilityLayer>
            <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand-accent)" stopOpacity={0.19} /><stop offset="100%" stopColor="var(--brand-accent)" stopOpacity={0.015} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#EBEAF2" strokeDasharray="4 4" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={8} tick={{ fill: "#71717A", fontSize: 11 }} />
            <YAxis width={39} axisLine={false} tickLine={false} domain={[0, (max: number) => Math.max(1, Math.ceil(max))]} tickCount={4} tickFormatter={(value) => `${value}m`} tick={{ fill: "#71717A", fontSize: 11 }} />
            <Tooltip cursor={{ stroke: "#C4B5FD", strokeDasharray: "4 3" }} content={({ active, payload, label }) => (
              active && payload?.length ? <div className="chart-tooltip"><strong>{label}</strong><span>{payload[0].value} min</span></div> : null
            )} />
            <Area dataKey="minutes" type="monotone" stroke="var(--primary)" strokeWidth={2.6} fill={`url(#${gradient})`}
              dot={{ r: 3, fill: "#fff", stroke: "var(--primary)", strokeWidth: 1.8 }}
              activeDot={{ r: 5, fill: "var(--primary)", stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={reduceMotion === false} animationDuration={500} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      </> : <p className="analytics-empty">{summary ? "Complete a tutor interaction or assessment to see activity here." : "Activity is currently unavailable."}</p>}
    </section>
  );
}

export function AIUsageChart({ summary }: { summary: DashboardSummary | null }) {
  const usage = learningModes.map(({ id, label, color }) => ({ label, color, value: summary?.usage[id] ?? 0 }));
  const total = usage.reduce((sum, item) => sum + item.value, 0);
  return (
    <section className="surface chart-card usage-card" aria-labelledby="usage-title">
      <div className="chart-heading"><div><h2 id="usage-title">AI Usage Breakdown</h2><p>How you use AI while learning</p></div></div>
      {total ? <div className="usage-content">
        <div className="usage-chart" aria-hidden>
          <PieChart width={105} height={105} accessibilityLayer={false}>
            <Pie data={usage.map((entry) => ({ ...entry, fill: entry.color }))} dataKey="value" startAngle={90} endAngle={-270} outerRadius={50} innerRadius={37} stroke="none" paddingAngle={3} cornerRadius={5} isAnimationActive={false} />
          </PieChart>
          <span><strong>{total}</strong><small>{total === 1 ? "reply" : "replies"}</small></span>
        </div>
        <ul className="usage-legend">
          {usage.map(({ label, value, color }) => <li key={label}><span className="legend-dot" style={{ backgroundColor: color }} /><span>{label}</span><strong>{Math.round(value / total * 100)}%</strong></li>)}
        </ul>
      </div> : <p className="analytics-empty">{summary ? "Your completed tutor replies will appear by learning mode." : "AI usage is currently unavailable."}</p>}
    </section>
  );
}
