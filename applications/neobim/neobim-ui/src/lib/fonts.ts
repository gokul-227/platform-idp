import { Geist, JetBrains_Mono } from "next/font/google";

// Identical to ui-neobim/packages/ui/fonts.ts — defined locally for the same
// Turbopack externalDir/.ts-resolution reason documented in ./cn.ts.
export const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const fontVariables = `${fontSans.variable} ${fontMono.variable}`;
