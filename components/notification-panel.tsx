"use client";

import * as Popover from "@radix-ui/react-popover";
import { Bell } from "lucide-react";
import { Button } from "./ui/button";

export function NotificationPanel() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="icon" aria-label="Notifications"><Bell size={19} aria-hidden /></Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content aria-label="Notifications" align="end" sideOffset={10} className="floating-panel notification-panel">
          <div className="notification-heading"><h2>Notifications</h2></div>
          <p className="dropdown-label">You don’t have any notifications yet.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
