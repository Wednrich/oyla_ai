export type Difficulty = "Beginner" | "Intermediate";
export type DifficultyFilter = Difficulty | "All levels";
export type LearningKind = "course" | "practice";
type Artwork = "code" | "network" | "brain" | "terminal" | "shapes" | "bug";

interface LearningItem {
  id: string;
  title: string;
  difficulty: Difficulty;
  artwork: Artwork;
  description: string;
}

export interface Course extends LearningItem {
  category: string;
}

export interface Practice extends LearningItem {
  minutes: number;
}

export const courses: Course[] = [
  { id: "python-fundamentals", title: "Python Fundamentals", category: "Programming", description: "Build confidence with variables, loops, and functions.", difficulty: "Beginner", artwork: "code" },
  { id: "data-structures", title: "Data Structures & Algorithms", category: "Computer Science", description: "Explore ways to organize data and solve problems.", difficulty: "Intermediate", artwork: "network" },
  { id: "critical-thinking", title: "Critical Thinking", category: "Core Skills", description: "Evaluate evidence and make well-reasoned decisions.", difficulty: "Beginner", artwork: "brain" },
];

export const practices: Practice[] = [
  { id: "python-problem-solving", title: "Python Problem Solving", description: "Apply Python fundamentals to short problems.", difficulty: "Beginner", minutes: 20, artwork: "terminal" },
  { id: "logical-reasoning", title: "Logical Reasoning", description: "Spot patterns and draw conclusions from clues.", difficulty: "Intermediate", minutes: 15, artwork: "shapes" },
  { id: "debugging-challenges", title: "Debugging Challenges", description: "Trace errors and repair small programs.", difficulty: "Intermediate", minutes: 25, artwork: "bug" },
];

export function matchesLearning(item: Course | Practice, query: string, level: DifficultyFilter) {
  const category = "category" in item ? item.category : "practice";
  const searchable = [item.title, item.description, item.difficulty, category].join(" ").toLowerCase();
  return (level === "All levels" || item.difficulty === level)
    && query.toLowerCase().trim().split(/\s+/).every((word) => searchable.includes(word));
}

export interface Metric {
  label: string;
  value: string;
  unit?: string;
  progress?: number;
  icon: "target" | "check" | "time" | "flame";
  experimental?: boolean;
}

