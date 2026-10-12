export type IconName = "shield" | "grid" | "launch" | "signal" | "replay" | "arrow" | "code" | "check" | "gift" | "graph" | "search" | "bell" | "calendar" | "database" | "menu" | "wallet" | "network" | "whale" | "pie" | "drop" | "bookmark" | "settings";

const paths: Record<IconName, string> = {
  menu: "M4 6h10 M4 12h8 M4 18h10 M20 7l-5 5 5 5",
  wallet: "M3 7V5h16v3 M3 8h18v13H3V8Z M16 12h5v5h-5v-5Z",
  network: "M12 9V5 M9 14l-4 3 M15 14l4 3 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M12 1a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z M3 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z M21 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  whale: "M3 10c0 6 4 9 10 9s8-4 8-9V5l-4 3-3-3v6 M3 10H1 M7 13h.01 M8 19l-1 3",
  pie: "M12 3v9h9 M9 3.5a9 9 0 1 0 11.5 11.5 M15 3.5a9 9 0 0 1 5.5 5.5H15V3.5Z",
  drop: "M12 2c-2 4-8 9-8 13a8 8 0 0 0 16 0c0-4-6-9-8-13Z",
  bookmark: "M6 3h12v18l-6-4-6 4V3Z",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  calendar: "M4 5h16v16H4z M4 9h16 M8 3v4 M16 3v4",
  database: "M20 6c0 2-3.6 3-8 3S4 8 4 6s3.6-3 8-3 8 1 8 3Z M4 6v12c0 2 3.6 3 8 3s8-1 8-3V6 M4 12c0 2 3.6 3 8 3s8-1 8-3",
  search: "M21 21l-5-5 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M8 12l3 3 5-6",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  launch: "M5 19 19 5 M5 5h14v14",
  signal: "M12 3 2 20h20L12 3Z M12 9v5 M12 17h.01",
  replay: "M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  code: "m8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18",
  check: "m5 12 4 4L19 6",
  gift: "M20 12v9H4v-9m-2-5h20v5H2zm10 14V7m0 0H7.5a2.5 2.5 0 1 1 2.5-2.5V7Zm0 0h4.5A2.5 2.5 0 1 0 12 4.5V7Z",
  graph: "M3 3v18h18 M7 14l4-4 4 3 6-7",
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
