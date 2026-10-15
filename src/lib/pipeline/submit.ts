import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { audit, notify } from "@/lib/audit";
import { adapterByKey } from "@/lib/apply/registry";
import type { FieldAnswer } from "@/lib/apply/form";
import type { SubmissionAdapter } from "@/lib/apply/types";
import { capacity } from "./context";
import { adapterContext, loadApplication, loadDocumentsForSubmit, toApplyJob } from "./prepare";

export type SubmitResult =
  | { kind: "confirmed"; confirmationId: string | null }
  | { kind: "unconfirmed" }
  | { kind: "failed"; retryable: boolean; error: string }
  | { kind: "deferred"; until: Date; reason: string }
  | { kind: "skipped"; reason: string };

/** Attempts in these states mean the employer may already have the application. */
const UNSAFE_PRIOR = ["IN_PROGRESS", "SUCCESS", "UNCONFIRMED"];

export class RetryableSubmissionError extends Error {}

/**
 * Submit one application exactly once.
 *  1. refuse if any prior attempt may have succeeded (must be verified first)
 *  2. enforce daily limit
 *  3. atomically move READY_TO_SUBMIT|RETRY_ELIGIBLE → SUBMITTING (single winner)
 *  4. record an attempt with a deterministic idempotency key
 *  5. call the adapter and persist the real outcome — never assume success
 */
export async function submitApplication(applicationId: string, deps: { adapterFor?: (key: string) => SubmissionAdapter | undefined } = {}): Promise<SubmitResult> {
  const app = await loadApplication(applicationId);
  if (app.status === "SUBMITTED_CONFIRMED") return { kind: "skipped", reason: "already confirmed" };
  if (app.attempts.some((a) => UNSAFE_PRIOR.includes(a.outcome))) {
    if (app.status !== "SUBMISSION_UNCONFIRMED") await db.application.update({ where: { id: app.id }, data: { status: "SUBMISSION_UNCONFIRMED" } });
    return { kind: "skipped", reason: "a previous attempt may have succeeded — verification required before any retry" };
  }
  if (!["READY_TO_SUBMIT", "RETRY_ELIGIBLE"].includes(app.status)) return { kind: "skipped", reason: `status is ${app.status}` };

  const job = toApplyJob(app.job);
  const { profile, prefs, credential } = await adapterContext(app.userId, job);
  const adapter = (deps.adapterFor ?? adapterByKey)(app.adapter ?? "");
  if (!adapter) return { kind: "skipped", reason: `no adapter "${app.adapter}"` };

  // Cross-application duplicate guard (same vacancy via another source already submitted).
  const sameVacancy = await db.application.findFirst({
    where: { userId: app.userId, id: { not: app.id }, job: { dedupeKey: app.job.dedupeKey }, status: { in: ["SUBMITTING", "SUBMITTED_CONFIRMED", "SUBMISSION_UNCONFIRMED"] } },
  });
  if (sameVacancy) {
    await db.application.update({ where: { id: app.id }, data: { status: "CANCELLED", error: "Duplicate of another application to the same vacancy" } });
    return { kind: "skipped", reason: "duplicate vacancy" };
  }

  // Applies in sandbox mode too, so a sandbox run behaves exactly like a live one.
  const cap = await capacity(app.userId, prefs, undefined, app.id);
  if (cap.dailyRemaining <= 0) return { kind: "deferred", until: cap.nextDayStart, reason: "daily application limit reached" };

  const lock = await db.application.updateMany({ where: { id: app.id, status: { in: ["READY_TO_SUBMIT", "RETRY_ELIGIBLE"] } }, data: { status: "SUBMITTING" } });
  if (lock.count === 0) return { kind: "skipped", reason: "another worker is handling this application" };

  const attemptNumber = app.attempts.length + 1;
  const idempotencyKey = sha256(`${app.applicationKey}:${attemptNumber}`);
  const attempt = await db.submissionAttempt.create({ data: { applicationId: app.id, attemptNumber, idempotencyKey, adapter: adapter.key, isTest: adapter.isTest, outcome: "IN_PROGRESS" } });

  let outcome;
  try {
    const docs = await loadDocumentsForSubmit(app.id);
    const answers: FieldAnswer[] = app.answers.map((a) => ({
      key: a.questionKey,
      label: a.questionLabel,
      type: a.fieldType as FieldAnswer["type"],
      required: a.required,
      value: a.answer,
      source: a.source as FieldAnswer["source"],
      sensitive: a.sensitive,
      requiresUserInput: a.requiresUserInput,
    }));
    if (answers.some((a) => a.required && a.requiresUserInput && !a.value)) throw new Error("Unanswered required questions");
    const safeName = (profile.fullName ?? "Candidate").replace(/[^A-Za-z0-9]+/g, "_");
    outcome = await adapter.submit({
      job,
      answers,
      resume: { filename: `${safeName}_Resume.pdf`, ...docs.resume },
      coverLetter: docs.coverLetter ? { filename: `${safeName}_Cover_Letter.pdf`, ...docs.coverLetter } : null,
      idempotencyKey,
      ctx: { userId: app.userId, profile, credential },
    });
  } catch (err) {
    // Failure before the request was sent (document load / validation): safe, nothing reached the employer.
    outcome = { outcome: "FAILED" as const, confirmed: false, evidence: { stage: "pre-send" }, error: (err as Error).message, retryable: false };
  }

  const now = new Date();
  await db.submissionAttempt.update({
    where: { id: attempt.id },
    data: { outcome: outcome.outcome, httpStatus: outcome.httpStatus, responseSummary: outcome.evidence as Prisma.InputJsonValue, error: outcome.error, finishedAt: now },
  });

  if (outcome.outcome === "SUCCESS" && outcome.confirmed) {
    await db.$transaction([
      db.application.update({ where: { id: app.id }, data: { status: "SUBMITTED_CONFIRMED", submittedAt: now, confirmedAt: now, error: null } }),
      db.submissionConfirmation.create({ data: { applicationId: app.id, attemptId: attempt.id, confirmationId: outcome.confirmationId ?? null, method: "API_RESPONSE", evidence: outcome.evidence as Prisma.InputJsonValue } }),
    ]);
    await audit(app.userId, "application.submitted_confirmed", { type: "Application", id: app.id }, { adapter: adapter.key, isTest: adapter.isTest, confirmationId: outcome.confirmationId });
    await notify(app.userId, "submitted", `${adapter.isTest ? "[TEST] " : ""}Application confirmed: ${app.job.title} at ${app.job.company}`, outcome.confirmationId ? `Confirmation ${outcome.confirmationId}` : undefined, `/applications/${app.id}`);
    return { kind: "confirmed", confirmationId: outcome.confirmationId ?? null };
  }
  if (outcome.outcome === "SUCCESS" || outcome.outcome === "UNCONFIRMED") {
    await db.application.update({ where: { id: app.id }, data: { status: "SUBMISSION_UNCONFIRMED", submittedAt: now, error: outcome.error ?? null } });
    await audit(app.userId, "application.submission_unconfirmed", { type: "Application", id: app.id }, { adapter: adapter.key, error: outcome.error });
    return { kind: "unconfirmed" };
  }
  const status = outcome.retryable ? "RETRY_ELIGIBLE" : outcome.outcome === "BLOCKED" ? "MANUAL_ACTION_REQUIRED" : "FAILED";
  await db.application.update({ where: { id: app.id }, data: { status, error: outcome.error ?? "Submission failed", manualReason: outcome.outcome === "BLOCKED" ? outcome.error : undefined } });
  await audit(app.userId, "application.submission_failed", { type: "Application", id: app.id }, { adapter: adapter.key, error: outcome.error, retryable: outcome.retryable });
  if (!outcome.retryable) await notify(app.userId, "failed", `Submission failed: ${app.job.title} at ${app.job.company}`, outcome.error, `/applications/${app.id}`);
  return { kind: "failed", retryable: outcome.retryable, error: outcome.error ?? "failed" };
}

/**
 * Resolve an unconfirmed submission by asking the provider. Only a definitive
 * NOT_FOUND makes the application eligible for a retry.
 */
export async function verifyConfirmation(applicationId: string, deps: { adapterFor?: (key: string) => SubmissionAdapter | undefined } = {}): Promise<"CONFIRMED" | "NOT_FOUND" | "UNKNOWN"> {
  const app = await loadApplication(applicationId);
  if (app.status !== "SUBMISSION_UNCONFIRMED") return app.status === "SUBMITTED_CONFIRMED" ? "CONFIRMED" : "UNKNOWN";
  const attempt = [...app.attempts].reverse().find((a) => UNSAFE_PRIOR.includes(a.outcome));
  const adapter = (deps.adapterFor ?? adapterByKey)(attempt?.adapter ?? app.adapter ?? "");
  if (!attempt || !adapter?.verify) return "UNKNOWN";
  const job = toApplyJob(app.job);
  const { profile, credential } = await adapterContext(app.userId, job);
  const res = await adapter.verify({ job, idempotencyKey: attempt.idempotencyKey, confirmationId: null, ctx: { userId: app.userId, profile, credential } });
  if (res.status === "CONFIRMED") {
    await db.$transaction([
      db.submissionAttempt.update({ where: { id: attempt.id }, data: { outcome: "SUCCESS" } }),
      db.application.update({ where: { id: app.id }, data: { status: "SUBMITTED_CONFIRMED", confirmedAt: new Date(), error: null } }),
      db.submissionConfirmation.create({ data: { applicationId: app.id, attemptId: attempt.id, confirmationId: res.confirmationId ?? null, method: "STATUS_CHECK", evidence: res.evidence as Prisma.InputJsonValue } }),
    ]);
    await notify(app.userId, "submitted", `Application confirmed: ${app.job.title} at ${app.job.company}`, undefined, `/applications/${app.id}`);
  } else if (res.status === "NOT_FOUND") {
    await db.$transaction([
      db.submissionAttempt.update({ where: { id: attempt.id }, data: { outcome: "FAILED", error: "Provider has no record of this submission" } }),
      db.application.update({ where: { id: app.id }, data: { status: "RETRY_ELIGIBLE", error: "Previous attempt was not received by the provider; safe to retry" } }),
    ]);
  }
  return res.status;
}

/** Called on worker start: attempts left IN_PROGRESS by a crash become unconfirmed (never re-sent blindly). */
export async function recoverInterruptedSubmissions(): Promise<string[]> {
  const stuck = await db.submissionAttempt.findMany({ where: { outcome: "IN_PROGRESS", startedAt: { lt: new Date(Date.now() - 2 * 60_000) } } });
  for (const a of stuck) {
    await db.submissionAttempt.update({ where: { id: a.id }, data: { outcome: "UNCONFIRMED", error: "Worker interrupted during submission" } });
    await db.application.update({ where: { id: a.applicationId }, data: { status: "SUBMISSION_UNCONFIRMED" } });
  }
  return stuck.map((a) => a.applicationId);
}
