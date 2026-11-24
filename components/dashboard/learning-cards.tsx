import { ArrowRight, BrainCircuit, Bug, Clock3, CodeXml, Network, Shapes, Signal, SquareTerminal } from "lucide-react";
import Link from "next/link";
import type { Course, Practice } from "@/lib/learning";
import { Button } from "../ui/button";

const artworkIcons = {
  code: CodeXml, network: Network, brain: BrainCircuit,
  terminal: SquareTerminal, shapes: Shapes, bug: Bug,
};

function Thumbnail({ artwork, compact = false }: { artwork: Course["artwork"]; compact?: boolean }) {
  const Icon = artworkIcons[artwork];
  return (
    <div className="learning-thumbnail" data-artwork={artwork} data-compact={compact} aria-hidden>
      <span className="art-orbit art-orbit-one" /><span className="art-orbit art-orbit-two" />
      <span className="art-spark art-spark-one" /><span className="art-spark art-spark-two" />
      <span className="art-tile"><Icon size={compact ? 25 : 32} strokeWidth={1.65} /></span>
    </div>
  );
}

export function CourseCard({ course }: { course: Course }) {
  const { title, artwork, description, difficulty, category, id } = course;
  return (
    <article className="surface course-card">
      <Thumbnail artwork={artwork} />
      <div className="course-body">
        <span className="course-category" data-artwork={artwork}>{category}</span>
        <h3>{title}</h3>
        <p className="course-description">{description}</p>
        <p className="card-detail"><Signal size={14} aria-hidden />{difficulty}</p>
        <Button asChild variant="outline" size="sm" className="course-action">
          <Link href={`/materials?item=${id}`} aria-label={`Continue ${title}`}>Continue <ArrowRight size={15} aria-hidden /></Link>
        </Button>
      </div>
    </article>
  );
}

export function PracticeCard({ practice }: { practice: Practice }) {
  const { id, title, artwork, difficulty, minutes } = practice;
  return (
    <article className="surface practice-card">
      <div className="practice-content">
        <Thumbnail artwork={artwork} compact />
        <div>
          <h3>{title}</h3>
          <p className="card-detail practice-detail"><span>{difficulty}</span><span><Clock3 size={13} aria-hidden />{minutes} min</span></p>
        </div>
      </div>
      <Button asChild variant="ghost" size="sm" className="practice-action">
        <Link href={`/practice?item=${id}`} aria-label={`Start ${title}`}>Start Practice <ArrowRight size={15} aria-hidden /></Link>
      </Button>
    </article>
  );
}
