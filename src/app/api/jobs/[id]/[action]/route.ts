import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { HttpError, withUser } from "@/lib/api";
import { applicationKeyFor } from "@/lib/pipeline/matching";
import { enqueue, QUEUES } from "@/lib/queue/queues";

type Ctx = { params: Promise<{ id: string; action: string }> };

/**
 * apply   — user explicitly asks to apply to this job: prepares documents and
 *           submits through a supported route (or creates a manual task).
 * dismiss — hide from matches and never auto-apply.
 */
export const POST = withUser<Ctx>(async (_req, user, { params }) => {
  const { id, action } = await params;
  const job = await db.job.findUnique({ where: { id } });
  if (!job) throw new HttpError(404, "Job not found");

  if (action === "dismiss") {
    await db.jobMatch.updateMany({ where: { userId: user.id, jobId: id }, data: { dismissed: true } });
    return NextResponse.json({ ok: true });
  }
  if (action !== "apply") throw new HttpError(404, "Unknown action");

  const [profile, prefs] = await Promise.all([db.userProfile.findUnique({ where: { userId: user.id } }), db.jobPreferences.findUnique({ where: { userId: user.id } })]);
  if (!profile?.verifiedAt) throw new HttpError(400, "Verify your profile in Resume Studio first.");
  if (job.status === "CLOSED") throw new HttpError(409, "This listing is closed.");

  const key = applicationKeyFor(user.id, job.dedupeKey);
  const existing = await db.application.findFirst({ where: { OR: [{ applicationKey: key }, { userId: user.id, jobId: id }] } });
  if (existing) throw new HttpError(409, `You already have an application for this vacancy (status: ${existing.status.toLowerCase().replace(/_/g, " ")}).`);
  try {
    const app = await db.application.create({ data: { userId: user.id, jobId: id, applicationKey: key, status: "QUEUED", isTest: job.isMock || (prefs?.submissionMode ?? "SANDBOX") === "SANDBOX" } });
    await enqueue(QUEUES.verification, "verify", { userId: user.id, applicationId: app.id, manual: true }, { dedupeId: `verify-${app.id}` });
    await audit(user.id, "application.created_manual", { type: "Application", id: app.id }, { jobId: id });
    return NextResponse.json({ applicationId: app.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new HttpError(409, "Already applied to this vacancy.");
    throw err;
  }
});
