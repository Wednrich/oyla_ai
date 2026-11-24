"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { navigation } from "@/lib/navigation";
import { Button } from "./ui/button";

function NavTooltip({ label, enabled, children }: { label: string; enabled: boolean; children: ReactElement }) {
  if (!enabled) return children;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className="nav-tooltip" side="right" sideOffset={12}>{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <Image src="/oyla-logo.png" alt="OYLA" width={2172} height={724} sizes="205px" />
    </span>
  );
}

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  onLogout: () => void;
}

export function Sidebar({ collapsed = false, onToggle, onNavigate, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className="sidebar-content" data-collapsed={collapsed}>
      <div className="sidebar-top">
        <Link href="/dashboard" className="brand-link" aria-label="OYLA overview" onClick={onNavigate}><Brand /></Link>
        {onToggle && (
          <Button variant="ghost" size="icon" className="sidebar-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} onClick={onToggle}><ToggleIcon size={17} /></Button>
        )}
      </div>
      <Tooltip.Provider delayDuration={160}>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Main navigation" className="sidebar-nav">
          {navigation.map(({ slug, label, icon: Icon }) => (
            <NavTooltip key={slug} label={label} enabled={collapsed}>
              <Link href={`/${slug}`} className="nav-link" aria-label={label} aria-current={pathname === `/${slug}` ? "page" : undefined} onClick={onNavigate}>
                <Icon size={19} strokeWidth={1.8} aria-hidden /><span>{label}</span>
              </Link>
            </NavTooltip>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavTooltip label="Log out" enabled={collapsed}>
            <button className="nav-link" aria-label="Log out" onClick={onLogout}><LogOut size={19} strokeWidth={1.8} aria-hidden /><span>Log out</span></button>
          </NavTooltip>
        </div>
      </Tooltip.Provider>
    </div>
  );
}
