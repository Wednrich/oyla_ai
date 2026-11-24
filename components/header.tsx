"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { ArrowUpRight, Menu, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { courses, matchesLearning, practices, type DifficultyFilter } from "@/lib/learning";
import { navigation } from "@/lib/navigation";
import { NotificationPanel } from "./notification-panel";
import { ProfileDropdown, type ProfileIdentity } from "./profile-dropdown";
import { Button } from "./ui/button";
import { Brand } from "./sidebar";

const levels: DifficultyFilter[] = ["All levels", "Beginner", "Intermediate"];

interface HeaderProps {
  identity: ProfileIdentity;
  query: string;
  level: DifficultyFilter;
  onQuery: (query: string) => void;
  onLevel: (level: DifficultyFilter) => void;
  onLogout: () => void;
}

export function Header({ identity, query, level, onQuery, onLevel, onLogout }: HeaderProps) {
  const input = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLDivElement>(null);
  const [showResults, setShowResults] = useState(false);
  const keyword = query.trim().toLowerCase();
  const results = keyword ? [
    ...courses.filter((item) => matchesLearning(item, keyword, level)).map(({ id, title }) => ({ title, label: "Course", href: `/materials?item=${id}` })),
    ...practices.filter((item) => matchesLearning(item, keyword, level)).map(({ id, title }) => ({ title, label: "Practice", href: `/practice?item=${id}` })),
    ...navigation.filter(({ label }) => label.toLowerCase().includes(keyword)).map(({ slug, label }) => ({ title: label, label: "Page", href: `/${slug}` })),
  ] : [];

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    }
    function dismissSearch(event: PointerEvent) {
      if (event.target instanceof Node && !search.current?.contains(event.target)) setShowResults(false);
    }
    window.addEventListener("keydown", handleShortcut);
    document.addEventListener("pointerdown", dismissSearch);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      document.removeEventListener("pointerdown", dismissSearch);
    };
  }, []);

  return (
    <header className="topbar">
      <Dialog.Trigger asChild>
        <Button variant="outline" size="icon" className="mobile-menu-button" aria-label="Open navigation"><Menu size={20} /></Button>
      </Dialog.Trigger>
      <Link href="/dashboard" className="mobile-brand" aria-label="OYLA overview"><Brand /></Link>
      <div className="search-area" ref={search} role="search"
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setShowResults(false); }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && showResults && keyword) {
            event.preventDefault();
            setShowResults(false);
          }
        }}>
        <div className="search-field">
          <Search size={18} aria-hidden />
          <input ref={input} type="search" aria-label="Search topics, lessons, or materials" placeholder="Search topics, lessons, or materials..." value={query}
            onFocus={() => setShowResults(true)} onChange={(event) => { onQuery(event.target.value); setShowResults(true); }} />
          {query
            ? <button className="clear-search" aria-label="Clear search" onClick={() => { onQuery(""); input.current?.focus(); }}><X size={15} /></button>
            : <kbd aria-hidden>⌘ K</kbd>}
        </div>
        {showResults && keyword && (
          <div className="floating-panel search-results">
            <p className="dropdown-label" role="status">{results.length ? `${results.length} search results` : "No results found"}</p>
            {results.map(({ href, title, label }) => (
              <Link key={href} href={href} className="menu-item search-result" onClick={() => { onQuery(""); setShowResults(false); }}>
                <span>{title}</span><small>{label}</small><ArrowUpRight size={14} aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </div>
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button variant="outline" size="icon" aria-label="Filter learning by difficulty" className={level !== "All levels" ? "filter-button filter-active" : "filter-button"}><SlidersHorizontal size={18} aria-hidden /></Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content aria-label="Learning filters" align="end" sideOffset={10} className="floating-panel filter-panel">
            <fieldset>
              <legend className="dropdown-label">Learning difficulty</legend>
              {levels.map((option) => <label key={option} className="filter-option"><input type="radio" name="difficulty" checked={option === level} onChange={() => onLevel(option)} />{option}</label>)}
            </fieldset>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <div className="header-account">
        <NotificationPanel />
        <ProfileDropdown identity={identity} onLogout={onLogout} />
      </div>
    </header>
  );
}
