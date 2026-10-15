import Link from "next/link";
import { CheckCircle2, CircleAlert, Pause, Play, Rocket, Square } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { agentReadiness, getAgent } from "@/lib/pipeline/agent";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { timeAgo } from "@/lib/utils";
import { ActionButton, AutoRefresh } from "@/components/client";
import { PreferencesForm } from "@/components/preferences-form";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Progress } from "@/components/ui";

const TASK_TONE: Record<string, "success" | "warning" | "destructive" | "muted" | "info"> = { COMPLETED: "success", ACTIVE: "info", QUEUED: "muted", FAILED: "destructive", CANCELLED: "muted" };

export default async function AgentPage() {
  const user = await requireUser();
  const [agent, problems, prefs, tasks, counts] = await Promise.all([
    getAgent(user.id),
    agentReadiness(user.id),
    db.jobPreferences.findUnique({ where: { userId: user.id } }),
    db.backgroundTask.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 25 }),
    db.application.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x.status, x._count]));
  const running = agent.status === "RUNNING";
  const paused = agent.status === "PAUSED";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <AutoRefresh ms={running ? 4000 : 10000} />
      <PageHeader title="Auto-Apply Agent" description="Discovers, matches, prepares, and submits — within your rules, only through supported integrations." />

      <Card className={running ? "border-success/50" : paused ? "border-warning/50" : ""}>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="flex items-center gap-2 text-2xl font-semibold">
              <span className={`size-3 rounded-full ${running ? "animate-pulse bg-success" : paused ? "bg-warning" : "bg-muted-foreground"}`} />
              {agent.status.charAt(0) + agent.status.slice(1).toLowerCase()}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {agent.currentStep ?? "Not started"}
              {agent.lastRunAt && ` · last activity ${timeAgo(agent.lastRunAt)}`}
            </p>
            {prefs && (
              <p className="mt-2 text-xs">
                Mode: <Badge tone={prefs.submissionMode === "LIVE" ? "warning" : "info"}>{prefs.submissionMode === "LIVE" ? "LIVE submissions" : "SANDBOX (test) submissions"}</Badge>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!running && !paused && (
              <ActionButton url="/api/agent" json={{ action: "start" }} size="lg" disabled={problems.length > 0}>
                <Rocket /> Start Job Search & Auto-Apply
              </ActionButton>
            )}
            {running && (
              <ActionButton url="/api/agent" json={{ action: "pause" }} variant="outline" size="lg">
                <Pause /> Pause
              </ActionButton>
            )}
            {paused && (
              <ActionButton url="/api/agent" json={{ action: "resume" }} size="lg">
                <Play /> Resume
              </ActionButton>
            )}
            {(running || paused) && (
              <ActionButton url="/api/agent" json={{ action: "stop" }} variant="destructive" size="lg" confirmText="Stops scheduling and halts queued work.">
                <Square /> Stop
              </ActionButton>
            )}
          </div>
        </CardContent>
      </Card>

      {problems.length > 0 && (
        <Alert tone="warning" title="Before the agent can start">
          <ul className="mt-1 space-y-1">
            {problems.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <CircleAlert className="size-4 text-warning" /> {p}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <Link href="/resume" className="text-primary hover:underline">Resume Studio</Link> · <Link href="/settings" className="text-primary hover:underline">Search preferences</Link>
          </p>
        </Alert>
      )}
      {problems.length === 0 && !running && !paused && (
        <Alert tone="success" title="Ready">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" /> Profile verified, preferences set, auto-apply enabled.
          </span>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["In preparation", (c.QUEUED ?? 0) + (c.PREPARING ?? 0) + (c.READY_TO_SUBMIT ?? 0) + (c.SUBMITTING ?? 0)],
          ["Confirmed", c.SUBMITTED_CONFIRMED ?? 0],
          ["Needs you", (c.MANUAL_ACTION_REQUIRED ?? 0) + (c.SUBMISSION_UNCONFIRMED ?? 0)],
          ["Failed", c.FAILED ?? 0],
        ].map(([label, n]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular-nums">{n}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live activity</CardTitle>
          <CardDescription>Background tasks across all queues (refreshes automatically).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          {tasks.map((t) => (
            <div key={t.id} className="flex flex-col gap-1 rounded-md border p-2 text-sm sm:flex-row sm:items-center sm:gap-3">
              <Badge tone={TASK_TONE[t.status] ?? "muted"} className="w-24 justify-center">
                {t.status.toLowerCase()}
              </Badge>
              <span className="w-48 shrink-0 font-medium">{t.queue}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={t.error ?? t.message ?? ""}>
                {t.error ?? t.message ?? ""}
              </span>
              {t.status === "ACTIVE" && <Progress value={t.progress} className="w-24" />}
              <span className="text-xs text-muted-foreground">{timeAgo(t.updatedAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-apply rules</CardTitle>
          <CardDescription>The agent never applies outside these rules, never fabricates answers, and pauses for your input on legal or sensitive questions.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm section="rules" initial={{ ...DEFAULT_PREFERENCES, ...(prefs ?? {}) } as typeof DEFAULT_PREFERENCES} />
        </CardContent>
      </Card>
    </div>
  );
}
