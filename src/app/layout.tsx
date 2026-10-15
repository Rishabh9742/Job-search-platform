import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/client";

export const metadata: Metadata = {
  title: "JobPilot AI",
  description: "Worldwide job search and authorized auto-application agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
