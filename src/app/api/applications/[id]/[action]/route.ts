import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { HttpError, withUser } from "@/lib/api";
import { enqueue, QUEUES } from "@/lib/queue/queues";
import type { AnswerBankEntry } from "@/lib/profile/schema";

type Ctx = { params: Promise<{ id: string; action: string }> };

const Answers = z.object({ answers: z.record(z.string(), z.string().max(5000)), saveToBank: z.array(z.string()).default([]) });
const Outcome = z.object({ outcome: z.enum(["NONE", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"]) });

export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { id, action } = await params;
  const app = await db.application.findFirst({ where: { id, userId: user.id }, include: { attempts: true, documents: true, answers: true } });
  if (!app) throw new HttpError(404, "Application not found");
  const unsafe = app.attempts.some((a) => ["IN_PROGRESS", "SUCCESS", "UNCONFIRMED"].includes(a.outcome));

  switch (action) {
    case "answers": {
      const body = Answers.parse(await req.json());
      if (["SUBMITTING", "SUBMITTED_CONFIRMED", "SUBMISSION_UNCONFIRMED"].includes(app.status)) throw new HttpError(409, "Application already submitted");
      for (const [key, value] of Object.entries(body.answers)) {
        const existing = app.answers.find((a) => a.questionKey === key);
        if (!existing || !value.trim()) continue;
        await db.applicationAnswer.update({ where: { id: existing.id }, data: { answer: value.trim(), source: "USER", requiresUserInput: false } });
      }
      if (body.saveToBank.length) {
        const profile = await db.userProfile.findUnique({ where: { userId: user.id } });
        const bank = ((profile?.answerBank ?? []) as unknown as AnswerBankEntry[]).slice();
        for (const key of body.saveToBank) {
          const a = app.answers.find((x) => x.questionKey === key);
          const v = body.answers[key];
          if (a && v && !a.sensitive) bank.push({ key: crypto.randomUUID(), question: a.questionLabel, answer: v.trim() });
        }
        await db.userProfile.update({ where: { userId: user.id }, data: { answerBank: bank as unknown as Prisma.InputJsonValue } });
      }
      await db.application.update({ where: { id }, data: { status: "PREPARING", manualReason: null } });
      await enqueue(QUEUES.preparation, "prepare", { userId: user.id, applicationId: id, manual: true }, { dedupeId: `prepare-${id}-${Date.now()}` });
      await audit(user.id, "application.answers_provided", { type: "Application", id }, { keys: Object.keys(body.answers) });
      break;
    }
    case "retry": {
      if (unsafe) throw new HttpError(409, "A previous attempt may have reached the employer. Verify it first instead of retrying.");
      if (app.status === "RETRY_ELIGIBLE") {
        await db.application.update({ where: { id }, data: { status: "READY_TO_SUBMIT", error: null } });
        await enqueue(QUEUES.submission, "submit", { userId: user.id, applicationId: id, manual: true }, { dedupeId: `submit-${id}-${Date.now()}` });
      } else if (["FAILED", "CANCELLED", "MANUAL_ACTION_REQUIRED"].includes(app.status)) {
        await db.application.update({ where: { id }, data: { status: "QUEUED", error: null, manualReason: null } });
        await enqueue(QUEUES.verification, "verify", { userId: user.id, applicationId: id, manual: true }, { dedupeId: `verify-${id}-${Date.now()}` });
      } else throw new HttpError(409, `Cannot retry from status ${app.status}`);
      await audit(user.id, "application.retry", { type: "Application", id });
      break;
    }
    case "verify": {
      if (app.status !== "SUBMISSION_UNCONFIRMED") throw new HttpError(409, "Only unconfirmed submissions can be verified");
      await enqueue(QUEUES.confirmation, "confirm", { userId: user.id, applicationId: id, manual: true }, { dedupeId: `confirm-${id}-${Date.now()}` });
      break;
    }
    case "cancel": {
      if (["SUBMITTING", "SUBMITTED_CONFIRMED"].includes(app.status)) throw new HttpError(409, "Cannot cancel a submitted application");
      await db.application.update({ where: { id }, data: { status: "CANCELLED" } });
      await audit(user.id, "application.cancelled", { type: "Application", id });
      break;
    }
    case "mark-applied": {
      // The user applied themselves (manual task). Recorded as self-reported evidence, distinct from API confirmation.
      if (!["MANUAL_ACTION_REQUIRED", "SUBMISSION_UNCONFIRMED", "FAILED"].includes(app.status)) throw new HttpError(409, "Only manual or unconfirmed applications can be marked as applied");
      const now = new Date();
      const attempt = await db.submissionAttempt.create({
        data: { applicationId: id, attemptNumber: app.attempts.length + 1, idempotencyKey: `user-${id}-${now.getTime()}`, adapter: "user-manual", outcome: "SUCCESS", finishedAt: now, responseSummary: { reportedBy: "user" } },
      });
      await db.$transaction([
        db.application.update({ where: { id }, data: { status: "SUBMITTED_CONFIRMED", submittedAt: app.submittedAt ?? now, confirmedAt: now, adapter: app.adapter ?? "manual", manualReason: null } }),
        db.submissionConfirmation.upsert({
          where: { applicationId: id },
          create: { applicationId: id, attemptId: attempt.id, method: "USER_REPORTED", evidence: { note: "User confirmed they applied on the employer site" } },
          update: { attemptId: attempt.id, method: "USER_REPORTED", evidence: { note: "User confirmed they applied on the employer site" }, confirmedAt: now },
        }),
      ]);
      await audit(user.id, "application.marked_applied", { type: "Application", id });
      break;
    }
    case "outcome": {
      const { outcome } = Outcome.parse(await req.json());
      await db.application.update({ where: { id }, data: { outcome, outcomeUpdatedAt: new Date() } });
      await audit(user.id, "application.outcome", { type: "Application", id }, { outcome });
      break;
    }
    default:
      throw new HttpError(404, "Unknown action");
  }
  return NextResponse.json({ ok: true });
});
