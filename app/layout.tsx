import type { Metadata } from "next";
import "@fontsource-variable/inter/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OYLA", template: "%s | OYLA" },
  description: "Learn with AI. Think independently.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
