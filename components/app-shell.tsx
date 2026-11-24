"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { MotionConfig } from "framer-motion";
import { X } from "lucide-react";
import { createContext, useActionState, useContext, useState, type ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import type { DifficultyFilter } from "@/lib/learning";
import type { ProfileIdentity } from "./profile-dropdown";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { Button } from "./ui/button";

const LearningFilters = createContext<{ query: string; level: DifficultyFilter }>({ query: "", level: "All levels" });

export function useLearningFilters() {
  return useContext(LearningFilters);
}

export function AppShell({ children, identity }: { children: ReactNode; identity: ProfileIdentity }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logout, logoutAction, logoutPending] = useActionState(signOut, {});
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<DifficultyFilter>("All levels");

  function requestLogout() {
    setMobileOpen(false);
    setLogoutOpen(true);
  }

  return (
    <MotionConfig reducedMotion="user">
      <LearningFilters.Provider value={{ query, level }}>
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <div className="app-shell" data-sidebar-collapsed={collapsed}>
            <a className="skip-link" href="#main-content">Skip to content</a>
            <aside className="desktop-sidebar"><Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} onLogout={requestLogout} /></aside>
            <div className="workspace">
              <Header identity={identity} query={query} level={level} onQuery={setQuery} onLevel={setLevel} onLogout={requestLogout} />
              <main id="main-content" tabIndex={-1}>{children}</main>
            </div>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="mobile-sidebar" aria-describedby={undefined}>
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Close asChild><Button variant="ghost" size="icon" className="drawer-close" aria-label="Close navigation"><X size={20} /></Button></Dialog.Close>
                <Sidebar onNavigate={() => setMobileOpen(false)} onLogout={requestLogout} />
              </Dialog.Content>
            </Dialog.Portal>
            <Dialog.Root open={logoutOpen} onOpenChange={setLogoutOpen}>
              <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="floating-panel logout-dialog">
                  <Dialog.Title>Log out of OYLA?</Dialog.Title>
                  <Dialog.Description>Your saved learning activity will be ready when you sign in again.</Dialog.Description>
                  {"error" in logout && logout.error && <p className="auth-feedback" role="alert">{logout.error}</p>}
                  <form action={logoutAction} className="dialog-actions">
                    <Dialog.Close asChild><Button variant="outline">Cancel</Button></Dialog.Close>
                    <Button type="submit" disabled={logoutPending}>Log out</Button>
                  </form>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </Dialog.Root>
      </LearningFilters.Provider>
    </MotionConfig>
  );
}
