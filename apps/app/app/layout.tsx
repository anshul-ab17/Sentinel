import localFont from "next/font/local";

import type { Metadata } from "next";
import "./globals.css";
import "@app/components/wallet-connect.css";

const sans = localFont({
  src: "./fonts/geist-sans.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});
const mono = localFont({
  src: "./fonts/geist-mono.woff2",
  variable: "--font-mono",
  weight: "100 900",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  icons: { icon: "/sentinel.png", apple: "/sentinel.png" },
  title: "Sentinel AI · Launch intelligence",
  description: "Evidence-first Solana launch investigations, powered by covered on-chain data.",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{let theme;try{theme=localStorage.getItem('sentinel-theme')}catch{}document.documentElement.dataset.theme=theme==='light'||theme==='dark'?theme:'dark'})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
