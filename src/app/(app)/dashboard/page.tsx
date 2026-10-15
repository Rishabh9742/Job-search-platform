import Link from "next/link";
import { Bell, CheckCircle2, Circle, Rocket } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { agentReadiness, getAgent } from "@/lib/pipeline/agent";
import { timeAgo } from "@/lib/utils";
import { ActionButton, AutoRefresh } from "@/components/client";
import { ApplicationRow } from "@/components/application-row";
import { Button, Card, CardContent, CardHeader, CardTitle, PageHeader, Stat } from "@/components/ui";

export default async function Dashboard() {
  const user = await requireUser();
  const [agent, problems, jobsFound, eligible, statusCounts, outcomes, notifications, recent, profile, resume, prefs] = await Promise.all([
    getAgent(user.id),
    agentReadiness(user.id),
    db.jobMatch.count({ where: { userId: user.id, job: { isMock: false } } }),
    db.jobMatch.count({ where: { userId: user.id, eligible: true, dismissed: false } }),
    db.application.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    db.application.groupBy({ by: ["outcome"], where: { userId: user.id }, _count: true }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.application.findMany({ where: { userId: user.id }, include: { job: { select: { title: true, company: true, sourceKey: true, isMock: true } } }, orderBy: { updatedAt: "desc" }, take: 6 }),
    db.userProfile.findUnique({ where: { userId: user.id } }),
    db.masterResume.findFirst({ where: { userId: user.id, isActive: true } }),
    db.jobPreferences.findUnique({ where: { userId: user.id } }),
  ]);
  const s = Object.fromEntries(statusCounts.map((x) => [x.status, x._count])) as Record<string, number>;
  const o = Object.fromEntries(outcomes.map((x) => [x.outcome, x._count])) as Record<string, number>;
  const unread = notifications.filter((n) => !n.readAt).length;
  const steps = [
    { done: !!resume, label: "Upload your resume", href: "/resume" },
    { done: !!profile?.verifiedAt, label: "Verify your extracted profile", href: "/resume" },
    { done: !!prefs && (prefs.categories.length > 0 || prefs.customRoles.length > 0), label: "Choose categories, countries & filters", href: "/settings" },
    { done: !!prefs?.autoApplyEnabled, label: "Configure auto-apply rules & limits", href: "/agent" },
    { done: agent.status === "RUNNING", label: "Start Job Search & Auto-Apply", href: "/agent" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {agent.status === "RUNNING" && <AutoRefresh ms={8000} />}
      <PageHeader
        title="Dashboard"
        description={agent.status === "RUNNING" ? `Agent running · ${agent.currentStep ?? ""}` : "Your job search at a glance."}
        actions={
          agent.status !== "RUNNING" ? (
            <Button asChild size="lg">
              <Link href="/agent">
                <Rocket /> Start Auto-Apply
              </Link>
            </Button>
          ) : undefined
        }
      />

      {steps.some((x) => !x.done) && (
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-5">
            {steps.map((st, i) => (
              <Link key={st.label} href={st.href} className="flex items-start gap-2 rounded-md border p-3 text-sm hover:bg-accent">
                {st.done ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                <span className={st.done ? "text-muted-foreground line-through" : ""}>
                  {i + 1}. {st.label}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Real jobs found" value={jobsFound} hint="evaluated against your profile" />
        <Stat label="Eligible matches" value={eligible} />
        <Stat label="Being prepared" value={(s.QUEUED ?? 0) + (s.PREPARING ?? 0) + (s.READY_TO_SUBMIT ?? 0) + (s.SUBMITTING ?? 0)} />
        <Stat label="Submitted & confirmed" value={s.SUBMITTED_CONFIRMED ?? 0} tone="success" />
        <Stat label="Unconfirmed" value={s.SUBMISSION_UNCONFIRMED ?? 0} tone={s.SUBMISSION_UNCONFIRMED ? "warning" : undefined} />
        <Stat label="Manual-action tasks" value={s.MANUAL_ACTION_REQUIRED ?? 0} tone={s.MANUAL_ACTION_REQUIRED ? "warning" : undefined} />
        <Stat label="Failed" value={s.FAILED ?? 0} tone={s.FAILED ? "destructive" : undefined} />
        <Stat label="Interview invitations" value={o.INTERVIEW ?? 0} hint="recorded by you" />
        <Stat label="Offers" value={o.OFFER ?? 0} hint="recorded by you" />
        <Stat label="Agent" value={agent.status.toLowerCase()} hint={agent.lastRunAt ? `active ${timeAgo(agent.lastRunAt)}` : undefined} />
      </div>
      {problems.length > 0 && agent.status !== "RUNNING" && <p className="text-sm text-muted-foreground">To start the agent: {problems.join(" ")}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent applications</CardTitle>
            <Link href="/applications" className="text-sm text-primary hover:underline">
              All →
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 ? <p className="text-sm text-muted-foreground">No applications yet.</p> : recent.map((a) => <ApplicationRow key={a.id} a={a} />)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-4" /> Notifications {unread > 0 && <span className="text-xs text-primary">({unread} new)</span>}
            </CardTitle>
            {unread > 0 && (
              <ActionButton url="/api/notifications" size="sm" variant="ghost">
                Mark read
              </ActionButton>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {notifications.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
            {notifications.map((n) => (
              <Link key={n.id} href={n.link ?? "#"} className={`block rounded-md border p-2 text-sm hover:bg-accent ${n.readAt ? "opacity-70" : "border-primary/30"}`}>
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                <p className="text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
