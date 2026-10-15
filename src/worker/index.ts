/**
 * JobPilot background worker. Run with `npm run worker`.
 * One BullMQ Worker per queue; each stage enqueues the next. All state lives
 * in Postgres + Redis, so the pipeline resumes after restarts.
 */
import { DelayedError, Worker, type Job, type Processor } from "bullmq";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { notify } from "@/lib/audit";
import { enqueue, getQueue, QUEUES, redisConnection, type QueueName, type StageData } from "@/lib/queue/queues";
import { runDiscovery } from "@/lib/pipeline/discovery";
import { runMatching } from "@/lib/pipeline/matching";
import { generateCoverLetterStage, generateResumeStage, prepareApplication, verifyListing } from "@/lib/pipeline/prepare";
import { recoverInterruptedSubmissions, submitApplication, verifyConfirmation } from "@/lib/pipeline/submit";
import { gateDecision, resumePending } from "@/lib/pipeline/agent";
import { processResumeUpload } from "@/lib/pipeline/resume";

type Data = StageData & { taskId?: string };

const task = (id: string | undefined, data: Prisma.BackgroundTaskUpdateInput) => (id ? db.backgroundTask.update({ where: { id }, data }).catch(() => undefined) : undefined);

async function setStep(userId: string, step: string) {
  await db.agentState.updateMany({ where: { userId }, data: { currentStep: step, lastRunAt: new Date() } });
}

/**
 * Pause/stop gate for autonomous work. Manual (user-initiated) jobs bypass it.
 * Paused → job is pushed back 60s. Stopped → job ends without acting.
 */
async function gate(job: Job<Data>, token: string | undefined): Promise<"run" | "stop"> {
  const agent = job.data.manual ? null : await db.agentState.findUnique({ where: { userId: job.data.userId } });
  const decision = gateDecision(agent?.status, !!job.data.manual);
  if (decision === "stop") return "stop";
  if (decision === "delay") {
    await task(job.data.taskId, { status: "QUEUED", message: "Waiting — agent paused" });
    await job.moveToDelayed(Date.now() + 60_000, token);
    throw new DelayedError();
  }
  return "run";
}

function wrap(name: string, fn: (job: Job<Data>) => Promise<unknown>, opts: { gated?: boolean } = { gated: true }): Processor<Data> {
  return async (job, token) => {
    // Repeatable scheduler jobs don't have a task row yet.
    if (!job.data.taskId) {
      const t = await db.backgroundTask.create({ data: { userId: job.data.userId, queue: job.queueName, type: job.name, status: "QUEUED", bullJobId: job.id, payload: job.data as Prisma.InputJsonValue } });
      job.data.taskId = t.id;
      await job.updateData(job.data);
    }
    if (opts.gated !== false && (await gate(job, token)) === "stop") {
      await task(job.data.taskId, { status: "CANCELLED", message: "Agent stopped" });
      return { cancelled: true };
    }
    await task(job.data.taskId, { status: "ACTIVE", attempts: job.attemptsMade + 1, message: `${name} started` });
    const result = await fn(job);
    await task(job.data.taskId, { status: "COMPLETED", progress: 100, result: (result ?? {}) as Prisma.InputJsonValue, message: `${name} finished` });
    return result;
  };
}

const progress = (job: Job<Data>) => async (pct: number, msg: string) => {
  await job.updateProgress(pct);
  await task(job.data.taskId, { progress: pct, message: msg });
};

const next = (queue: QueueName, type: string, job: Job<Data>, dedupe: string, delay = 0) =>
  enqueue(queue, type, { userId: job.data.userId, applicationId: job.data.applicationId, manual: job.data.manual }, { dedupeId: dedupe, delay });

const processors: Record<QueueName, Processor<Data> | null> = {
  [QUEUES.resumeParse]: wrap("Resume parsing", async (job) => processResumeUpload(job.data.resumeId!), { gated: false }),

  [QUEUES.discovery]: wrap("Job discovery", async (job) => {
    await setStep(job.data.userId, "Discovering jobs");
    const report = await runDiscovery(job.data.userId, progress(job));
    await enqueue(QUEUES.matching, "match", { userId: job.data.userId, manual: job.data.manual }, { dedupeId: `match-${job.data.userId}-${Date.now()}` });
    await db.agentState.updateMany({ where: { userId: job.data.userId }, data: { lastRunAt: new Date() } });
    return report;
  }),

  [QUEUES.matching]: wrap("Matching", async (job) => {
    await setStep(job.data.userId, "Scoring matches");
    const agent = await db.agentState.findUnique({ where: { userId: job.data.userId } });
    const report = await runMatching(job.data.userId, agent?.status === "RUNNING");
    for (const id of report.applicationsCreated) await enqueue(QUEUES.verification, "verify", { userId: job.data.userId, applicationId: id }, { dedupeId: `verify-${id}` });
    if (report.applicationsCreated.length) await notify(job.data.userId, "agent", `Agent queued ${report.applicationsCreated.length} application(s)`, `${report.eligible} eligible of ${report.evaluated} evaluated`, "/queue");
    await setStep(job.data.userId, report.applicationsCreated.length ? "Preparing applications" : "Idle — waiting for next discovery run");
    return report;
  }),

  [QUEUES.verification]: wrap("Listing verification", async (job) => {
    const state = await verifyListing(job.data.applicationId!);
    if (state !== "CLOSED") await next(QUEUES.resumeGeneration, "resume", job, `resume-${job.data.applicationId}`);
    return { state };
  }),

  [QUEUES.resumeGeneration]: wrap("Tailored resume", async (job) => {
    await setStep(job.data.userId, "Tailoring resumes");
    const r = await generateResumeStage(job.data.applicationId!);
    await next(QUEUES.coverLetter, "cover-letter", job, `cover-${job.data.applicationId}`);
    return r;
  }),

  [QUEUES.coverLetter]: wrap("Cover letter", async (job) => {
    const r = await generateCoverLetterStage(job.data.applicationId!);
    await next(QUEUES.preparation, "prepare", job, `prepare-${job.data.applicationId}`);
    return r;
  }),

  [QUEUES.preparation]: wrap("Application preparation", async (job) => {
    const r = await prepareApplication(job.data.applicationId!);
    if (r.state === "READY") await next(QUEUES.submission, "submit", job, `submit-${job.data.applicationId}`);
    return r;
  }),

  [QUEUES.submission]: wrap("Submission", async (job) => {
    await setStep(job.data.userId, "Submitting applications");
    const r = await submitApplication(job.data.applicationId!);
    if (r.kind === "unconfirmed") await next(QUEUES.confirmation, "confirm", job, `confirm-${job.data.applicationId}`, 30_000);
    if (r.kind === "deferred") {
      await job.moveToDelayed(r.until.getTime(), job.token);
      throw new DelayedError();
    }
    // Only provider-rejected-before-processing failures (429/503) are retried, with exponential backoff.
    if (r.kind === "failed" && r.retryable) {
      const app = await db.application.findUnique({ where: { id: job.data.applicationId! } });
      if (app?.status === "RETRY_ELIGIBLE") await db.application.update({ where: { id: app.id }, data: { status: "READY_TO_SUBMIT" } });
      throw new Error(`Retryable submission failure: ${r.error}`);
    }
    return r;
  }),

  [QUEUES.confirmation]: wrap(
    "Confirmation check",
    async (job) => {
      const status = await verifyConfirmation(job.data.applicationId!);
      if (status === "UNKNOWN" && job.attemptsMade + 1 < (job.opts.attempts ?? 1)) throw new Error("Confirmation still unknown; will check again");
      if (status === "UNKNOWN") await notify(job.data.userId, "unconfirmed", "Submission could not be confirmed", "Check the employer's confirmation email or portal before retrying.", `/applications/${job.data.applicationId}`);
      return { status };
    },
    { gated: false },
  ),

  [QUEUES.notifications]: wrap("Notification", async (job) => {
    await notify(job.data.userId, String(job.data.type ?? "info"), String(job.data.title ?? ""), job.data.body as string | undefined);
    return {};
  }, { gated: false }),

  [QUEUES.deadLetter]: null,
};

const CONCURRENCY: Partial<Record<QueueName, number>> = {
  [QUEUES.discovery]: 1,
  [QUEUES.matching]: 2,
  [QUEUES.resumeGeneration]: 2,
  [QUEUES.coverLetter]: 2,
  [QUEUES.preparation]: 2,
  [QUEUES.submission]: env().SUBMISSION_CONCURRENCY,
  [QUEUES.resumeParse]: 2,
};

async function main() {
  const workers: Worker[] = [];
  for (const [queue, processor] of Object.entries(processors) as [QueueName, Processor<Data> | null][]) {
    if (!processor) continue;
    const w = new Worker<Data>(queue, processor, {
      connection: redisConnection(),
      concurrency: CONCURRENCY[queue] ?? 1,
      limiter: queue === QUEUES.discovery ? { max: 5, duration: 60_000 } : undefined,
    });
    w.on("failed", async (job, err) => {
      if (!job) return;
      const final = job.attemptsMade >= (job.opts.attempts ?? 1);
      await task(job.data.taskId, { status: final ? "FAILED" : "QUEUED", error: err.message.slice(0, 1000), attempts: job.attemptsMade, message: final ? "Failed permanently" : `Retrying (attempt ${job.attemptsMade})` });
      if (final) {
        await getQueue(QUEUES.deadLetter).add("dead", { queue, data: job.data, error: err.message, failedAt: new Date().toISOString() });
        if (job.data.applicationId && queue !== QUEUES.confirmation) {
          await db.application.updateMany({ where: { id: job.data.applicationId, status: { in: ["QUEUED", "PREPARING", "READY_TO_SUBMIT"] } }, data: { status: "FAILED", error: `${queue}: ${err.message}`.slice(0, 1000) } });
          await notify(job.data.userId, "failed", "An application step failed", `${queue}: ${err.message}`.slice(0, 300), `/applications/${job.data.applicationId}`);
        }
      }
      console.error(`[worker] ${queue} job ${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`);
    });
    w.on("error", (err) => console.error(`[worker] ${queue} error: ${err.message}`));
    workers.push(w);
  }

  // Recovery after restart.
  const recovered = await recoverInterruptedSubmissions();
  if (recovered.length) console.log(`[worker] ${recovered.length} interrupted submission(s) marked unconfirmed for verification`);
  const resumed = await resumePending();
  console.log(`[worker] ready — ${workers.length} queues, ${resumed} pending item(s) re-enqueued`);

  const shutdown = async () => {
    console.log("[worker] shutting down gracefully…");
    await Promise.all(workers.map((w) => w.close()));
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
