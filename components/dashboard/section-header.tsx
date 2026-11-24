import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function SectionHeader({ id, title, description, href, action }: {
  id: string; title: string; description: string; href: string; action: string;
}) {
  return (
    <div className="section-header">
      <div><h2 id={id}>{title}</h2><p>{description}</p></div>
      <Link href={href} className="section-link">{action}<ArrowRight size={15} aria-hidden /></Link>
    </div>
  );
}
