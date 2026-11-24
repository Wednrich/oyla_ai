"use client";

import { ArrowRight, ClipboardCheck, SearchX } from "lucide-react";
import Link from "next/link";
import { useLearningFilters } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import type { DashboardSummary } from "@/lib/dashboard";
import { courses, matchesLearning, practices, type Metric } from "@/lib/learning";
import { AIUsageChart, LearningActivityChart } from "./charts";
import { HeroBanner } from "./hero-banner";
import { CourseCard, PracticeCard } from "./learning-cards";
import { MetricCard } from "./metric-card";
import { SectionHeader } from "./section-header";

function EmptyResults() {
  return <p className="surface empty-results" role="status"><SearchX size={19} aria-hidden /> No matches. Try another search or difficulty.</p>;
}

function formatTime(seconds: number) {
  if (seconds < 60) return { value: String(seconds), unit: "sec" };
  if (seconds < 3600) return { value: String(Math.round(seconds / 60)), unit: "min" };
  return { value: (seconds / 3600).toFixed(1), unit: "hrs" };
}

function ProgressPanel({ summary }: { summary: DashboardSummary | null }) {
  return (
    <section className="surface personal-list" aria-labelledby="progress-title">
      <h2 id="progress-title">Learning Progress</h2>
      {summary?.courses.length ? <ul>{summary.courses.map(({ id, title, completed, total }) => (
        <li key={id}><span>{title}</span><span>{completed} of {total} lessons complete</span></li>
      ))}</ul> : <p>{summary ? "Your progress will appear when you start a lesson." : "Learning progress is currently unavailable."}</p>}
    </section>
  );
}

function RecentConversations({ summary }: { summary: DashboardSummary | null }) {
  return (
    <section aria-labelledby="recent-conversations">
      <SectionHeader id="recent-conversations" title="Recent Conversations" description="Resume a saved tutor conversation." href="/tutor" action="Open tutor" />
      {summary?.conversations.length
        ? <ul className="surface personal-list">{summary.conversations.map(({ id, title }) =>
            <li key={id}><Link href={`/tutor?conversation=${id}`}>{title}<ArrowRight size={14} aria-hidden /></Link></li>)}</ul>
        : <p className="surface analytics-empty">{summary ? "Start a tutor conversation to see it here." : "Recent conversations are currently unavailable."}</p>}
    </section>
  );
}

export function Dashboard({ name, summary }: { name: string; summary: DashboardSummary | null }) {
  const { query, level } = useLearningFilters();
  const visibleCourses = courses.filter((item) => matchesLearning(item, query, level));
  const visiblePractices = practices.filter((item) => matchesLearning(item, query, level));
  const metrics: Metric[] = [
    { label: "Independence Score", value: "—", icon: "target", experimental: true },
    { label: "Tasks Completed", value: summary ? String(summary.tasks) : "—", icon: "check" },
    { label: "Learning Time", ...(summary ? formatTime(summary.durationSeconds) : { value: "—" }), icon: "time" },
    { label: "Learning Streak", value: summary ? String(summary.streak) : "—", unit: summary ? "days" : undefined, icon: "flame" },
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-intro">
        <p className="eyebrow purple-text">OVERVIEW</p>
        <h1>{name === "Student" ? "Welcome to OYLA!" : `Welcome back, ${name.split(/\s+/)[0]}!`}</h1>
        <p>Here&apos;s what&apos;s happening in your learning journey.</p>
      </div>
      {!summary && <p className="auth-feedback dashboard-feedback" role="alert">Could not load personal activity. Check the Supabase migrations and reload.</p>}
      <div className="dashboard-columns">
        <div className="primary-column">
          <HeroBanner />
          <section aria-labelledby="continue-learning">
            <SectionHeader id="continue-learning" title="Continue Learning" description="Sample course catalog" href="/materials" action="View materials" />
            {visibleCourses.length
              ? <div className="learning-grid">{visibleCourses.map((course) => <CourseCard key={course.id} course={course} />)}</div>
              : <EmptyResults />}
          </section>
          <section aria-labelledby="recommended-practice">
            <SectionHeader id="recommended-practice" title="Recommended Practice" description="Sample practice catalog" href="/practice" action="View practice" />
            {visiblePractices.length
              ? <div className="learning-grid">{visiblePractices.map((practice) => <PracticeCard key={practice.id} practice={practice} />)}</div>
              : <EmptyResults />}
          </section>
          <RecentConversations summary={summary} />
          <ProgressPanel summary={summary} />
        </div>
        <aside className="analytics-column" aria-label="Learning analytics">
          <section aria-labelledby="snapshot-title">
            <div className="snapshot-heading"><h2 id="snapshot-title">Learning Snapshot</h2></div>
            <div className="metric-grid">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
          </section>
          <LearningActivityChart summary={summary} />
          <AIUsageChart summary={summary} />
          <section className="surface personal-list" aria-labelledby="assessment-results">
            <h2 id="assessment-results">Assessment Results</h2>
            {summary?.assessments.length ? <ul>{summary.assessments.map(({ id, title, score }) => (
              <li key={id}><span>{title}</span><strong>{score}%</strong></li>
            ))}</ul> : <p>{summary ? "Completed assessments will appear here." : "Assessment results are currently unavailable."}</p>}
          </section>
          <section className="assessment-card" aria-labelledby="assessment-title">
            <div className="assessment-icon"><ClipboardCheck size={21} aria-hidden /></div>
            <div><h2 id="assessment-title">Think beyond the answer.</h2>
              <p>Challenge yourself with independent assessments and discover what you can solve without AI.</p>
              <Button asChild size="sm"><Link href="/assessment">Start Assessment <ArrowRight size={14} aria-hidden /></Link></Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
