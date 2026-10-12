type IconName = "shield" | "grid" | "launch" | "signal" | "replay" | "arrow" | "code" | "check" | "gift" | "graph" | "search";

const paths: Record<IconName, string> = {
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
