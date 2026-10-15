import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { db } from "@/lib/db";

export const QUEUES = {
  resumeParse: "resume-parse",
  discovery: "job-discovery",
  verification: "job-verification",
  matching: "matching",
  resumeGeneration: "resume-generation",
  coverLetter: "cover-letter-generation",
  preparation: "application-preparation",
  submission: "application-submission",
  confirmation: "confirmation-verification",
  notifications: "notifications",
  deadLetter: "dead-letter",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface StageData {
  userId: string;
  applicationId?: string;
  resumeId?: string;
  /** User-initiated — runs even when the autonomous agent is paused. */
  manual?: boolean;
  [k: string]: unknown;
}

const g = globalThis as unknown as { __jpRedis?: IORedis; __jpQueues?: Map<string, Queue> };

export function redisConnection(): IORedis {
  if (!g.__jpRedis) g.__jpRedis = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  return g.__jpRedis;
}

/** Retry/backoff defaults per queue. Submission never auto-retries blindly — its processor decides. */
export const QUEUE_DEFAULTS: Record<QueueName, JobsOptions> = {
  [QUEUES.resumeParse]: { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
  [QUEUES.discovery]: { attempts: 3, backoff: { type: "exponential", delay: 60_000 } },
  [QUEUES.verification]: { attempts: 3, backoff: { type: "exponential", delay: 15_000 } },
  [QUEUES.matching]: { attempts: 2, backoff: { type: "exponential", delay: 10_000 } },
  [QUEUES.resumeGeneration]: { attempts: 3, backoff: { type: "exponential", delay: 20_000 } },
  [QUEUES.coverLetter]: { attempts: 3, backoff: { type: "exponential", delay: 20_000 } },
  [QUEUES.preparation]: { attempts: 3, backoff: { type: "exponential", delay: 20_000 } },
  [QUEUES.submission]: { attempts: 4, backoff: { type: "exponential", delay: 60_000 } },
  [QUEUES.confirmation]: { attempts: 5, backoff: { type: "exponential", delay: 60_000 } },
  [QUEUES.notifications]: { attempts: 3, backoff: { type: "fixed", delay: 5_000 } },
  [QUEUES.deadLetter]: { attempts: 1 },
};

export function getQueue(name: QueueName): Queue {
  g.__jpQueues ??= new Map();
  let q = g.__jpQueues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: redisConnection(),
      defaultJobOptions: { ...QUEUE_DEFAULTS[name], removeOnComplete: { age: 24 * 3600, count: 2000 }, removeOnFail: { age: 14 * 24 * 3600 } },
    });
    g.__jpQueues.set(name, q);
  }
  return q;
}

/**
 * Enqueue a stage and record a BackgroundTask row for progress reporting.
 * `dedupeId` makes the job idempotent: BullMQ ignores adds with an existing id.
 */
export async function enqueue(queue: QueueName, type: string, data: StageData, opts: JobsOptions & { dedupeId?: string } = {}) {
  const { dedupeId, ...jobOpts } = opts;
  const jobId = dedupeId?.replace(/:/g, "_");
  if (jobId) {
    const existing = await getQueue(queue).getJob(jobId);
    if (existing && !(await existing.isCompleted()) && !(await existing.isFailed())) return existing;
    if (existing) await existing.remove().catch(() => undefined);
  }
  const task = await db.backgroundTask.create({
    data: { userId: data.userId, queue, type, status: "QUEUED", payload: data as Prisma.InputJsonValue },
  });
  const job = await getQueue(queue).add(type, { ...data, taskId: task.id }, { ...jobOpts, jobId });
  await db.backgroundTask.update({ where: { id: task.id }, data: { bullJobId: job.id } });
  return job;
}
