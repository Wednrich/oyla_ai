import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { courses, practices } from "@/lib/learning";
import { navigation } from "@/lib/navigation";

type Props = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ item?: string | string[]; tab?: string | string[] }>;
};

export function generateStaticParams() {
  return navigation.filter(({ slug }) => slug !== "dashboard").map(({ slug }) => ({ section: slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  return { title: navigation.find(({ slug }) => slug === section)?.label };
}

export default async function SectionPage({ params, searchParams }: Props) {
  const [{ section }, { item, tab }] = await Promise.all([params, searchParams]);
  const destination = navigation.find(({ slug }) => slug === section);
  if (!destination || destination.slug === "dashboard") notFound();

  const items = section === "materials" ? courses : section === "practice" ? practices : [];
  const selected = items.find(({ id }) => id === item);
  const showProfile = section === "settings" && tab === "profile";
  const Icon = destination.icon;

  return (
    <div className="placeholder-page">
      <p className="eyebrow purple-text">LEARNING WORKSPACE</p>
      <h1>{destination.label}</h1>
      <div className="surface placeholder-card">
        <span className="placeholder-icon"><Icon size={28} aria-hidden /></span>
        <h2>{showProfile ? "Profile" : selected?.title ?? destination.label}</h2>
        <p>{showProfile ? "View and manage your student profile." : selected?.description ?? destination.description}</p>
        <p className="placeholder-note">Coming in a future phase.</p>
        <Button asChild><Link href="/dashboard"><ArrowLeft size={16} /> Back to overview</Link></Button>
      </div>
    </div>
  );
}
