import type { ModuleView } from "@app/components/dashboard-module";
import type { IconName } from "@app/components/icon";

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
export const views: { name: View; label: string; group: string; icon: IconName }[] = [
  { name: "Overview", label: "Overview", group: "Monitor", icon: "grid" },
  { name: "Launches", label: "Launch Radar", group: "Monitor", icon: "launch" },
  { name: "DBC Explorer", label: "DBC Explorer", group: "Monitor", icon: "database" },
  { name: "Alerts", label: "Smart Alerts", group: "Monitor", icon: "bell" },
  { name: "Launch Autopsy", label: "Token Dossier", group: "Investigate", icon: "replay" },
  { name: "Wallet Graph", label: "Wallet Intelligence", group: "Investigate", icon: "wallet" },
  { name: "Funding Graph", label: "Funding Graph", group: "Investigate", icon: "network" },
  { name: "Whale Tracker", label: "Whale Tracker", group: "Investigate", icon: "whale" },
  { name: "Anomaly Engine", label: "Anomaly Engine", group: "Analyze", icon: "signal" },
  { name: "Holder Concentration", label: "Holder Concentration", group: "Analyze", icon: "pie" },
  { name: "Liquidity Monitor", label: "Liquidity Monitor", group: "Analyze", icon: "drop" },
  { name: "Analytics", label: "Analytics", group: "Analyze", icon: "graph" },
  {
    name: "Saved investigations",
    label: "Saved investigations",
    group: "Workspace",
    icon: "bookmark",
  },
];
