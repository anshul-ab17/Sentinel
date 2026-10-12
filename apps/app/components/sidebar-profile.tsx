"use client";

import { Menu } from "@base-ui/react/menu";

import { BrandLogo } from "@app/components/brand-logo";
import { Icon } from "@app/components/icon";
import { useSidebar } from "@app/components/ui/sidebar";

export function SidebarProfile({ onSettings }: { onSettings: () => void }) {
  const { open, isMobile, setOpenMobile } = useSidebar();
  return (
    <Menu.Root>
      <Menu.Trigger className="sidebar-profile" aria-label="Open profile menu">
        <BrandLogo size={32} />
        <span className="sidebar-profile-copy">
          <strong>Sentinel</strong>
          <small>Investigation workspace</small>
        </span>
        <svg
          className="sidebar-profile-chevron"
          width="14"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m8 8 4-4 4 4m-8 8 4 4 4-4" />
        </svg>
      </Menu.Trigger>
      <Menu.Portal>
        <div className="dashboard-shell sidebar-portal-theme">
          <Menu.Positioner
            side={open || isMobile ? "top" : "right"}
            align="end"
            sideOffset={8}
            className="sidebar-profile-positioner"
          >
            <Menu.Popup className="sidebar-profile-menu">
              <Menu.Group>
                <Menu.GroupLabel className="sidebar-profile-menu-label">
                  Sentinel workspace
                </Menu.GroupLabel>
                <Menu.Item
                  className="sidebar-profile-menu-item"
                  onClick={() => {
                    onSettings();
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  <Icon name="settings" size={16} />
                  <span>Settings</span>
                </Menu.Item>
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </div>
      </Menu.Portal>
    </Menu.Root>
  );
}
