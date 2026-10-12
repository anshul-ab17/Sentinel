"use client";
import { BrandLogo } from "@app/components/brand-logo";
import { ThemeToggle } from "@app/components/theme-toggle";
import { Icon } from "@app/components/icon";
import { SidebarProfile } from "@app/components/sidebar-profile";
import { CommandPalette } from "@app/components/command-palette";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@app/components/ui/sidebar";

import { views, type View } from "./navigation";

import type { Snapshot } from "@shared/snapshot";

type Props = {
  snapshot: Snapshot;
  view: View;
  setView: (view: View) => void;
  setQuery: (query: string) => void;
  setPoolId: (id: string) => void;
  setSelectedAlert: (id: string) => void;
};

export function DashboardNavigation({
  snapshot,
  view,
  setView,
  setQuery,
  setPoolId,
  setSelectedAlert,
}: Props) {
  return (
    <>
      <header className="topbar">
        <SidebarTrigger className="sidebar-window-trigger" />
        <a
          href="/"
          className="dashboard-navbar-brand dashboard-mobile-brand"
          aria-label="Sentinel home"
        >
          <BrandLogo size={30} />
        </a>
        <div className="breadcrumb">
          <Icon name="grid" size={16} />
          Workspace <span>/</span>{" "}
          <strong>{views.find((item) => item.name === view)?.label ?? view}</strong>
        </div>
        <CommandPalette
          snapshot={snapshot}
          onView={(nextView) => {
            setView(nextView);
            setQuery("");
          }}
          onPool={(id, search) => {
            setPoolId(id);
            setQuery(search);
            setView("Launches");
          }}
          onAlert={(id, search) => {
            setSelectedAlert(id);
            setQuery(search);
            setView("Alerts");
          }}
        />
        <div className="topbar-actions">
          <ThemeToggle />
          <button
            type="button"
            className="dashboard-notifications"
            aria-label="View detection signals"
            onClick={() => setView("Alerts")}
          >
            <Icon name="bell" size={19} />
            {snapshot.alerts.length > 0 && <i />}
          </button>
        </div>
      </header>
      <Sidebar>
        <SidebarHeader>
          <a href="/" aria-label="Sentinel home">
            <BrandLogo size={32} />
            <span className="sidebar-brand-copy">
              <strong>Sentinel</strong>
              <small>Launch intelligence</small>
            </span>
          </a>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Dashboard navigation">
            {["Monitor", "Investigate", "Analyze", "Workspace"].map((group) => (
              <SidebarGroup key={group}>
                <SidebarGroupLabel>{group}</SidebarGroupLabel>
                <SidebarMenu>
                  {views
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton
                          tooltip={item.label}
                          isActive={view === item.name}
                          title={item.label}
                          aria-label={item.name}
                          aria-current={view === item.name ? "page" : undefined}
                          onClick={() => {
                            setView(item.name);
                            setQuery("");
                          }}
                        >
                          <Icon name={item.icon} size={18} />
                          <span className="nav-text">{item.label}</span>
                          {item.name === "Alerts" && <b>{snapshot.alerts.length}</b>}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <a href="/api/pools" target="_blank" rel="noreferrer" title="Developer API">
            <Icon name="code" size={16} />
            <span>Developer API ↗</span>
          </a>
          <SidebarProfile onSettings={() => setView("Settings")} />
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
