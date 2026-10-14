import type { ModuleView } from "@app/components/dashboard-module";
import {
  BellRing,
  Bookmark,
  ChartNoAxesCombined,
  ChartPie,
  Droplets,
  FileSearch,
  GitFork,
  LayoutDashboard,
  Orbit,
  Radar,
  ScanSearch,
  Wallet,
  Waves,
  type LucideIcon,
} from "lucide-react";

export type View =
  | "Overview"
  | "Launches"
  | "Alerts"
  | "Wallet Graph"
  | "Launch Autopsy"
  | "DBC Explorer"
  | "Analytics"
  | "Funding Graph"
  | "Anomaly Engine"
  | ModuleView;
type SidebarView = { name: View; label: string; group: string; icon: LucideIcon };

export const views: SidebarView[] = [
  { name: "Overview", label: "Overview", group: "Monitor", icon: LayoutDashboard },
  { name: "Launches", label: "Launch Radar", group: "Monitor", icon: Radar },
  { name: "DBC Explorer", label: "DBC Explorer", group: "Monitor", icon: Orbit },
  { name: "Alerts", label: "Smart Alerts", group: "Monitor", icon: BellRing },
  { name: "Launch Autopsy", label: "Token Dossier", group: "Investigate", icon: FileSearch },
  { name: "Wallet Graph", label: "Wallet Intelligence", group: "Investigate", icon: Wallet },
  { name: "Funding Graph", label: "Funding Graph", group: "Investigate", icon: GitFork },
  { name: "Whale Tracker", label: "Whale Tracker", group: "Investigate", icon: Waves },
  { name: "Anomaly Engine", label: "Anomaly Engine", group: "Analyze", icon: ScanSearch },
  { name: "Holder Concentration", label: "Holder Concentration", group: "Analyze", icon: ChartPie },
  { name: "Liquidity Monitor", label: "Liquidity Monitor", group: "Analyze", icon: Droplets },
  { name: "Analytics", label: "Analytics", group: "Analyze", icon: ChartNoAxesCombined },
  {
    name: "Saved investigations",
    label: "Saved investigations",
    group: "Workspace",
    icon: Bookmark,
  },
];
