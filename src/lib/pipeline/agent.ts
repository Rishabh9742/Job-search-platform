import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { enqueue, getQueue, QUEUES } from "@/lib/queue/queues";

const schedulerId = (userId: string) => `discovery-schedule-${userId}`;

/**
 * Pause/stop gate applied before every autonomous stage. User-initiated
 * (manual) work always runs; a paused agent delays work; a stopped/idle agent
 * drops it without side effects.
 */
export function gateDecision(agentStatus: string | null | undefined, manual: boolean): "run" | "delay" | "stop" {
  if (manual) return "run";
  if (agentStatus === "RUNNING") return "run";
  if (agentStatus === "PAUSED") return "delay";
  return "stop";
}

export async function getAgent(userId: string) {
  return db.agentState.upsert({ where: { userId }, create: { userId }, update: {} });
}

/** Preconditions that must hold before autonomous mode may start. */
export async function agentReadiness(userId: string): Promise<string[]> {
  const [profile, prefs, resume] = await Promise.all([
    db.userProfile.findUnique({ where: { userId } }),
    db.jobPreferences.findUnique({ where: { userId } }),
    db.masterResume.findFirst({ where: { userId, isActive: true, parseStatus: "PARSED" } }),
  ]);
  const problems: string[] = [];
  if (!resume) problems.push("Upload a resume and let it finish parsing.");
  if (!profile?.verifiedAt) problems.push("Review and verify your extracted profile.");
  if (profile && profile.uncertainFields.length) problems.push(`Resolve ${profile.uncertainFields.length} uncertain profile field(s).`);
  if (!prefs) problems.push("Set your job preferences.");
  else {
    if (!prefs.categories.length && !prefs.customRoles.length && !prefs.keywords.length) problems.push("Choose at least one job category or custom role.");
    if (!prefs.autoApplyEnabled) problems.push("Enable automatic applications in Auto-Apply rules.");
  }
  return problems;
}

export async function startAgent(userId: string) {
  const prefs = await db.jobPreferences.findUniqueOrThrow({ where: { userId } });
  const every = Math.max(30, prefs.discoveryIntervalMinutes) * 60_000;
  await db.agentState.upsert({
    where: { userId },
    create: { userId, status: "RUNNING", startedAt: new Date(), currentStep: "Starting", nextRunAt: new Date(Date.now() + every) },
    update: { status: "RUNNING", startedAt: new Date(), pausedAt: null, currentStep: "Starting", nextRunAt: new Date(Date.now() + every) },
  });
  // The scheduler fires its first run immediately, then every `every` ms.
  await getQueue(QUEUES.discovery).upsertJobScheduler(schedulerId(userId), { every }, { name: "scheduled-discovery", data: { userId } });
  await resumePending(userId);
  await audit(userId, "agent.started", undefined, { intervalMinutes: every / 60000 });
}

export async function pauseAgent(userId: string) {
  await db.agentState.update({ where: { userId }, data: { status: "PAUSED", pausedAt: new Date(), currentStep: "Paused" } });
  await audit(userId, "agent.paused");
}

export async function resumeAgent(userId: string) {
  await db.agentState.update({ where: { userId }, data: { status: "RUNNING", pausedAt: null, currentStep: "Resuming" } });
  await resumePending(userId);
  await audit(userId, "agent.resumed");
}

/** Stop: remove the schedule; queued stages see STOPPED and exit without acting. */
export async function stopAgent(userId: string) {
  await db.agentState.update({ where: { userId }, data: { status: "STOPPED", currentStep: "Stopped", nextRunAt: null } });
  await getQueue(QUEUES.discovery).removeJobScheduler(schedulerId(userId));
  await audit(userId, "agent.stopped");
}

/** Re-enqueue applications that were mid-pipeline (after pause, stop, or a restart). Idempotent via dedupe ids. */
export async function resumePending(userId?: string) {
  const apps = await db.application.findMany({
    where: { ...(userId ? { userId } : {}), status: { in: ["QUEUED", "PREPARING", "READY_TO_SUBMIT"] } },
    include: { documents: true },
  });
  for (const a of apps) {
    const hasResume = a.documents.some((d) => d.kind === "RESUME");
    const hasCover = a.documents.some((d) => d.kind === "COVER_LETTER");
    if (a.status === "READY_TO_SUBMIT") await enqueue(QUEUES.submission, "submit", { userId: a.userId, applicationId: a.id }, { dedupeId: `submit-${a.id}` });
    else if (hasResume && hasCover) await enqueue(QUEUES.preparation, "prepare", { userId: a.userId, applicationId: a.id }, { dedupeId: `prepare-${a.id}` });
    else if (hasResume) await enqueue(QUEUES.coverLetter, "cover-letter", { userId: a.userId, applicationId: a.id }, { dedupeId: `cover-${a.id}` });
    else await enqueue(QUEUES.verification, "verify", { userId: a.userId, applicationId: a.id }, { dedupeId: `verify-${a.id}` });
  }
  const unconfirmed = await db.application.findMany({ where: { ...(userId ? { userId } : {}), status: "SUBMISSION_UNCONFIRMED" } });
  for (const a of unconfirmed) await enqueue(QUEUES.confirmation, "confirm", { userId: a.userId, applicationId: a.id }, { dedupeId: `confirm-${a.id}`, delay: 30_000 });
  return apps.length + unconfirmed.length;
}
