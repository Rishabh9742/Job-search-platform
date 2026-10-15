"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Bot, Briefcase, FileText, LayoutDashboard, ListChecks, LogOut, Plane, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, ThemeToggle } from "@/components/client";
import { Button } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Find Jobs", icon: Search },
  { href: "/resume", label: "Resume Studio", icon: FileText },
  { href: "/agent", label: "Auto-Apply Agent", icon: Bot },
  { href: "/queue", label: "Application Queue", icon: ListChecks },
  { href: "/applications", label: "Application Tracker", icon: Briefcase },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

const STATUS_STYLE: Record<string, string> = {
  RUNNING: "bg-success",
  PAUSED: "bg-warning",
  STOPPED: "bg-muted-foreground",
  IDLE: "bg-muted-foreground",
};

export function Sidebar({ email, agentStatus, agentStep, unread }: { email: string; agentStatus: string; agentStep: string | null; unread: number }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <aside className="flex w-full shrink-0 flex-col border-b bg-card md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <Plane className="size-5 text-primary" /> JobPilot AI
        </Link>
        <ThemeToggle />
      </div>
      <Link href="/agent" className="mx-3 mb-2 flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-accent" aria-label={`Agent status: ${agentStatus}`}>
        <span className={cn("size-2 rounded-full", STATUS_STYLE[agentStatus], agentStatus === "RUNNING" && "animate-pulse")} />
        <span className="font-medium">Agent {agentStatus.toLowerCase()}</span>
        {agentStep && agentStatus === "RUNNING" && <span className="truncate text-muted-foreground">· {agentStep}</span>}
      </Link>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-visible" aria-label="Main">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground", active && "bg-accent font-medium text-foreground")}
            >
              <n.icon className="size-4" />
              {n.label}
              {n.href === "/dashboard" && unread > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{unread}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="hidden items-center justify-between border-t px-4 py-3 text-xs md:flex">
        <span className="truncate text-muted-foreground" title={email}>
          {email}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          onClick={async () => {
            await api("/api/auth/logout", { method: "POST" });
            router.push("/login");
          }}
        >
          <LogOut />
        </Button>
      </div>
    </aside>
  );
}
