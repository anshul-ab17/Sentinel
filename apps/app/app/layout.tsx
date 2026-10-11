import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentinel AI · Launch intelligence",
  description: "Evidence-first Solana launch investigations. Initial development demo with synthetic data.",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(()=>{let theme;try{theme=localStorage.getItem('sentinel-theme')}catch{}document.documentElement.dataset.theme=theme==='light'||theme==='dark'?theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'})()` }}/></head><body>{children}</body></html>;
}
