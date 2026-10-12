"use client";

// Adapted from shadcn/ui's Base Nova sidebar composition and controlled-state API.
// https://ui.shadcn.com/r/styles/base-nova/sidebar.json
// Native CSS preserves Sentinel's existing design tokens and styles.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Tooltip } from "@base-ui/react/tooltip";
import { Icon } from "@app/components/icon";

type SidebarContextValue = {
  open: boolean;
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
};
const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within SidebarProvider.");
  return context;
}

export function SidebarProvider({
  children,
  open,
  onOpenChange,
}: {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [openMobile, setOpenMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 950px)");
    const sync = () => {
      setIsMobile(media.matches);
      if (!media.matches) setOpenMobile(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const toggleSidebar = useCallback(() => {
    if (isMobile) setOpenMobile((current) => !current);
    else onOpenChange(!open);
  }, [isMobile, open, onOpenChange]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "b" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [toggleSidebar]);
  return (
    <SidebarContext.Provider value={{ open, isMobile, openMobile, setOpenMobile, toggleSidebar }}>
      <Tooltip.Provider delay={350}>{children}</Tooltip.Provider>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ children }: { children: ReactNode }) {
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  if (isMobile)
    return (
      <Dialog.Root open={openMobile} onOpenChange={setOpenMobile}>
        <Dialog.Portal>
          <div className="dashboard-shell sidebar-portal-theme">
            <Dialog.Backdrop className="shadcn-sidebar-backdrop" />
            <Dialog.Popup
              className="sidebar shadcn-sidebar-mobile"
              data-slot="sidebar"
              data-mobile="true"
            >
              <Dialog.Title className="sr-only">Sentinel navigation</Dialog.Title>
              <Dialog.Description className="sr-only">
                Choose a monitoring, investigation, or analytics view.
              </Dialog.Description>
              {children}
            </Dialog.Popup>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    );
  return (
    <aside
      className="sidebar shadcn-sidebar"
      data-slot="sidebar"
      data-state={open ? "expanded" : "collapsed"}
      data-collapsible={open ? "" : "icon"}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ children }: { children: ReactNode }) {
  return (
    <div data-slot="sidebar-header" className="sidebar-brand">
      {children}
    </div>
  );
}
export function SidebarContent({ children }: { children: ReactNode }) {
  return (
    <div data-slot="sidebar-content" className="shadcn-sidebar-content">
      {children}
    </div>
  );
}
export function SidebarFooter({ children }: { children: ReactNode }) {
  return (
    <div data-slot="sidebar-footer" className="sidebar-bottom">
      {children}
    </div>
  );
}
export function SidebarGroup({ children }: { children: ReactNode }) {
  return (
    <div data-slot="sidebar-group" className="dashboard-nav-group">
      {children}
    </div>
  );
}
export function SidebarGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p data-slot="sidebar-group-label" className="nav-label">
      {children}
    </p>
  );
}
export function SidebarMenu({ children }: { children: ReactNode }) {
  return (
    <ul data-slot="sidebar-menu" className="shadcn-sidebar-menu">
      {children}
    </ul>
  );
}
export function SidebarMenuItem({ children }: { children: ReactNode }) {
  return <li data-slot="sidebar-menu-item">{children}</li>;
}

export function SidebarMenuButton({
  isActive,
  tooltip,
  children,
  className,
  ...props
}: ComponentProps<"button"> & { isActive: boolean; tooltip: string }) {
  const { open, isMobile, setOpenMobile } = useSidebar();
  const button = (
    <button
      {...props}
      type="button"
      data-slot="sidebar-menu-button"
      data-active={isActive || undefined}
      className={[isActive ? "active" : "", className].filter(Boolean).join(" ")}
      onClick={(event) => {
        props.onClick?.(event);
        if (isMobile && !event.defaultPrevented) setOpenMobile(false);
      }}
    >
      {children}
    </button>
  );
  if (open || isMobile) return button;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={button} />
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="right"
          sideOffset={12}
          className="shadcn-sidebar-tooltip-positioner"
        >
          <Tooltip.Popup className="shadcn-sidebar-tooltip">{tooltip}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function SidebarTrigger({
  className = "sidebar-collapse",
  ...props
}: ComponentProps<"button">) {
  const { open, isMobile, openMobile, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  return (
    <button
      {...props}
      type="button"
      className={className}
      data-slot="sidebar-trigger"
      aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
      aria-expanded={expanded}
      onClick={toggleSidebar}
    >
      <Icon name="menu" size={18} />
    </button>
  );
}
