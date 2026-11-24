"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "../ui/button";

export function HeroBanner() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="hero-orbits" aria-hidden />
      <motion.div className="hero-art" initial={false} animate={reduceMotion ? undefined : { y: [0, -5, 0] }} transition={{ duration: 1.1, ease: "easeInOut", repeat: 1 }}>
        <Image src="/learning-hero.png" width={640} height={603} priority alt="" />
      </motion.div>
      <div className="hero-content">
        <p className="hero-label"><Sparkles size={14} aria-hidden /> YOUR AI LEARNING COMPANION</p>
        <h2 id="hero-heading">Learn with AI.<br />Think independently.</h2>
        <p className="hero-description">Build real knowledge, strengthen your critical thinking, and become a more independent learner.</p>
        <div className="hero-actions">
          <Button asChild variant="white"><Link href="/tutor">Start Learning <ArrowRight size={16} aria-hidden /></Link></Button>
          <Button asChild variant="translucent"><Link href="/materials">Explore OYLA</Link></Button>
        </div>
      </div>
    </section>
  );
}
