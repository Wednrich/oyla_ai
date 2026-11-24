"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export interface ProfileIdentity { name: string; initials: string; avatar: string | null }

export function ProfileDropdown({ identity, onLogout }: { identity: ProfileIdentity; onLogout: () => void }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="profile-trigger" aria-label="Profile menu">
        <span className="avatar" aria-hidden>{identity.avatar ? <Image src={identity.avatar} width={36} height={36} unoptimized alt="" referrerPolicy="no-referrer" /> : identity.initials}</span>
        <span className="profile-text"><strong>{identity.name}</strong><small>Student</small></span>
        <ChevronDown className="profile-chevron" size={15} aria-hidden />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={10} className="floating-panel profile-menu">
          <Dropdown.Label className="dropdown-label">Your account</Dropdown.Label>
          <Dropdown.Item asChild><Link href="/settings#profile" className="menu-item"><UserRound size={16} /> Profile</Link></Dropdown.Item>
          <Dropdown.Item asChild><Link href="/settings" className="menu-item"><Settings size={16} /> Settings</Link></Dropdown.Item>
          <Dropdown.Separator className="menu-separator" />
          <Dropdown.Item className="menu-item" onSelect={onLogout}><LogOut size={16} /> Log out</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
