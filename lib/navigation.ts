import { BookOpen, Bot, ChartNoAxesCombined, ClipboardCheck, FlaskConical, History, LayoutGrid, Settings, Zap } from "lucide-react";

export const navigation = [
  { slug: "dashboard", label: "Overview", icon: LayoutGrid, description: "Your learning dashboard." },
  { slug: "tutor", label: "AI Tutor", icon: Bot, description: "Work through a topic with guided questions and hints." },
  { slug: "practice", label: "Practice", icon: Zap, description: "Develop your skills with short exercises and problem-solving challenges." },
  { slug: "assessment", label: "Assessment", icon: ClipboardCheck, description: "Find out what you can solve independently." },
  { slug: "materials", label: "Study Materials", icon: BookOpen, description: "Browse lessons and revisit the concepts you are learning." },
  { slug: "research-lab", label: "Research Lab", icon: FlaskConical, description: "Explore questions, evaluate sources, and build evidence-backed arguments." },
  { slug: "analytics", label: "Analytics", icon: ChartNoAxesCombined, description: "Explore patterns in your learning activity and progress." },
  { slug: "history", label: "History", icon: History, description: "Review your recent lessons and practice sessions." },
  { slug: "settings", label: "Settings", icon: Settings, description: "Manage your profile and learning preferences." },
] as const;
