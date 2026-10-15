import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { putFile } from "@/lib/storage";
import { renderLetterPdf } from "@/lib/documents/render";
import { recoverInterruptedSubmissions, submitApplication, verifyConfirmation } from "@/lib/pipeline/submit";
import { gateDecision } from "@/lib/pipeline/agent";
import type { SubmissionAdapter, SubmitOutcome, VerifyOutcome } from "@/lib/apply/types";
import { profile } from "./helpers/fixtures";

// Authorization tests call route handlers directly with a mocked session.
let sessionUserId: string | null = null;
vi.mock("@/lib/auth", () => ({ currentUser: async () => (sessionUserId ? { id: sessionUserId, email: "x@y.z", name: null } : null) }));

function fakeAdapter(outcomes: SubmitOutcome[], verify?: VerifyOutcome): SubmissionAdapter & { calls: number } {
  const a = {
    key: "fake",
    label: "fake",
    isTest: true,
    calls: 0,
    capabilities: {} as SubmissionAdapter["capabilities"],
    getForm: async () => [],
    submit: async () => {
      a.calls++;
      await new Promise((r) => setTimeout(r, 30));
      return outcomes[Math.min(a.calls - 1, outcomes.length - 1)];
    },
    verify: verify ? async () => verify : undefined,
  };
  return a;
}

const ok: SubmitOutcome = { outcome: "SUCCESS", confirmed: true, httpStatus: 200, confirmationId: "C-1", evidence: { body: { success: "ok" } }, retryable: false };
const timeout: SubmitOutcome = { outcome: "UNCONFIRMED", confirmed: false, evidence: { networkError: "timeout" }, error: "No response", retryable: false };
const rateLimited: SubmitOutcome = { outcome: "FAILED", confirmed: false, httpStatus: 429, evidence: {}, error: "429", retryable: true };

async function seed(email: string, opts: { adapterKey?: string; dailyLimit?: number } = {}) {
  const user = await db.user.create({ data: { email, passwordHash: "x" } });
  const p = profile();
  await db.userProfile.create({ data: { userId: user.id, fullName: p.fullName, email: p.email, skills: p.skills, verifiedAt: new Date(), workAuthorizations: p.workAuthorizations } });
  await db.jobPreferences.create({ data: { userId: user.id, categories: ["react"], maxApplicationsPerDay: opts.dailyLimit ?? 10 } });
  const job = await db.job.create({
    data: { sourceKey: "greenhouse", externalId: `b:${email}`, dedupeKey: `globex|react developer|IN|${email}`, canonicalUrl: `https://x/${email}`, title: "React Developer", company: "Globex", companyNormalized: "globex", description: "React", jobUrl: "https://x", applicationMethod: "GREENHOUSE", atsBoardToken: "b", atsJobId: "1" },
  });
  const app = await db.application.create({ data: { userId: user.id, jobId: job.id, applicationKey: `key-${email}`, status: "READY_TO_SUBMIT", adapter: opts.adapterKey ?? "fake", isTest: true } });
  const key = await putFile(user.id, "pdf", await renderLetterPdf("Resume", "r"));
  await db.applicationDocument.create({ data: { applicationId: app.id, kind: "RESUME", format: "PDF", storageKey: key } });
  await db.applicationAnswer.create({ data: { applicationId: app.id, questionKey: "first_name", questionLabel: "First Name", fieldType: "text", required: true, answer: "Priya", source: "PROFILE" } });
  return { user, job, app };
}

let n = 0;
const email = () => `u${++n}-${Date.now()}@test.dev`;

describe("submission engine", () => {
  beforeEach(() => {
    sessionUserId = null;
  });

  it("records a confirmed submission with evidence and a confirmation id", async () => {
    const { app } = await seed(email());
    const adapter = fakeAdapter([ok]);
    const r = await submitApplication(app.id, { adapterFor: () => adapter });
    expect(r).toEqual({ kind: "confirmed", confirmationId: "C-1" });
    const after = await db.application.findUniqueOrThrow({ where: { id: app.id }, include: { confirmation: true, attempts: true } });
    expect(after.status).toBe("SUBMITTED_CONFIRMED");
    expect(after.confirmation).toMatchObject({ method: "API_RESPONSE", confirmationId: "C-1" });
    expect(after.attempts[0].idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("prevents duplicate submission under concurrent workers (single winner)", async () => {
    const { app } = await seed(email());
    const adapter = fakeAdapter([ok]);
    const results = await Promise.all([1, 2, 3, 4].map(() => submitApplication(app.id, { adapterFor: () => adapter })));
    expect(adapter.calls).toBe(1);
    expect(results.filter((r) => r.kind === "confirmed")).toHaveLength(1);
    expect(await db.submissionAttempt.count({ where: { applicationId: app.id } })).toBe(1);
  });

  it("does not resubmit an already-confirmed application", async () => {
    const { app } = await seed(email());
    const adapter = fakeAdapter([ok]);
    await submitApplication(app.id, { adapterFor: () => adapter });
    await db.application.update({ where: { id: app.id }, data: { status: "READY_TO_SUBMIT" } }); // simulate a stray re-enqueue
    const r = await submitApplication(app.id, { adapterFor: () => adapter });
    expect(r.kind).toBe("skipped");
    expect(adapter.calls).toBe(1);
  });

  it("never auto-retries an uncertain submission; verification decides", async () => {
    const { app } = await seed(email());
    const adapter = fakeAdapter([timeout, ok], { status: "NOT_FOUND", evidence: {} });
    expect((await submitApplication(app.id, { adapterFor: () => adapter })).kind).toBe("unconfirmed");
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("SUBMISSION_UNCONFIRMED");

    // A blind retry is refused even if something flips the status back.
    await db.application.update({ where: { id: app.id }, data: { status: "RETRY_ELIGIBLE" } });
    expect((await submitApplication(app.id, { adapterFor: () => adapter })).kind).toBe("skipped");
    expect(adapter.calls).toBe(1);

    // Verification: provider definitively has no record → safe to retry.
    expect(await verifyConfirmation(app.id, { adapterFor: () => adapter })).toBe("NOT_FOUND");
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("RETRY_ELIGIBLE");
    expect((await submitApplication(app.id, { adapterFor: () => adapter })).kind).toBe("confirmed");
    expect(adapter.calls).toBe(2);
  });

  it("confirms an uncertain submission via status check without resending", async () => {
    const { app } = await seed(email());
    const adapter = fakeAdapter([timeout], { status: "CONFIRMED", confirmationId: "SBX-1", evidence: { lookup: true } });
    await submitApplication(app.id, { adapterFor: () => adapter });
    expect(await verifyConfirmation(app.id, { adapterFor: () => adapter })).toBe("CONFIRMED");
    const after = await db.application.findUniqueOrThrow({ where: { id: app.id }, include: { confirmation: true } });
    expect(after.status).toBe("SUBMITTED_CONFIRMED");
    expect(after.confirmation).toMatchObject({ method: "STATUS_CHECK", confirmationId: "SBX-1" });
    expect(adapter.calls).toBe(1);
  });

  it("marks provider-rejected-before-processing failures (429) as retry eligible and retries with a new idempotency key", async () => {
    const { app } = await seed(email());
    const adapter = fakeAdapter([rateLimited, ok]);
    expect(await submitApplication(app.id, { adapterFor: () => adapter })).toMatchObject({ kind: "failed", retryable: true });
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("RETRY_ELIGIBLE");
    expect((await submitApplication(app.id, { adapterFor: () => adapter })).kind).toBe("confirmed");
    const keys = (await db.submissionAttempt.findMany({ where: { applicationId: app.id } })).map((a) => a.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("recovers attempts interrupted by a crash as unconfirmed (not resent)", async () => {
    const { app } = await seed(email());
    await db.application.update({ where: { id: app.id }, data: { status: "SUBMITTING" } });
    await db.submissionAttempt.create({ data: { applicationId: app.id, attemptNumber: 1, idempotencyKey: `crash-${app.id}`, adapter: "fake", outcome: "IN_PROGRESS", startedAt: new Date(Date.now() - 10 * 60_000) } });
    expect(await recoverInterruptedSubmissions()).toContain(app.id);
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("SUBMISSION_UNCONFIRMED");
  });

  it("enforces the daily limit for live adapters", async () => {
    const { app, user, job } = await seed(email(), { dailyLimit: 1 });
    await db.application.create({ data: { userId: user.id, jobId: (await db.job.create({ data: { ...job, id: undefined, externalId: `${job.externalId}-2`, dedupeKey: `other-${job.id}`, raw: undefined } })).id, applicationKey: `other-${app.id}`, status: "SUBMITTED_CONFIRMED", submittedAt: new Date() } });
    const live = { ...fakeAdapter([ok]), isTest: false };
    const r = await submitApplication(app.id, { adapterFor: () => live });
    expect(r.kind).toBe("deferred");
  });

  it("cancels a second application to the same vacancy found via another source", async () => {
    const { app, user, job } = await seed(email());
    const dupJob = await db.job.create({ data: { ...job, id: undefined, sourceKey: "adzuna", externalId: `dup-${job.id}`, raw: undefined } });
    const dup = await db.application.create({ data: { userId: user.id, jobId: dupJob.id, applicationKey: `dup-${app.id}`, status: "READY_TO_SUBMIT", adapter: "fake" } });
    const adapter = fakeAdapter([ok]);
    await submitApplication(app.id, { adapterFor: () => adapter });
    expect((await submitApplication(dup.id, { adapterFor: () => adapter })).kind).toBe("skipped");
    expect((await db.application.findUniqueOrThrow({ where: { id: dup.id } })).status).toBe("CANCELLED");
    expect(adapter.calls).toBe(1);
  });
});

describe("agent application limits", () => {
  it("concurrent matching runs never create more applications than the daily limit", async () => {
    const { runMatching } = await import("@/lib/pipeline/matching");
    const user = await db.user.create({ data: { email: email(), passwordHash: "x" } });
    const p = profile();
    await db.userProfile.create({
      data: { userId: user.id, fullName: p.fullName, email: p.email, countryCode: "IN", skills: p.skills, yearsExperience: 5, verifiedAt: new Date(), workAuthorizations: p.workAuthorizations, experience: p.experience as never },
    });
    await db.jobPreferences.create({ data: { userId: user.id, categories: ["react"], countries: ["IN"], minMatchScore: 0, maxApplicationsPerDay: 2, maxApplicationsPerEmployer: 5, autoApplyEnabled: true } });
    for (let i = 0; i < 5; i++) {
      await db.job.create({
        data: { sourceKey: "greenhouse", externalId: `lim-${user.id}-${i}`, dedupeKey: `lim-${user.id}-${i}`, canonicalUrl: `https://lim/${user.id}/${i}`, title: `React Developer ${i}`, company: `Co${i}`, companyNormalized: `co${i}`, description: "Requirements\nReact, TypeScript, Redux", countries: ["IN"], workArrangement: "ONSITE", postedAt: new Date(), jobUrl: "https://x", lastSeenAt: new Date() },
      });
    }
    await Promise.all([runMatching(user.id, true), runMatching(user.id, true), runMatching(user.id, true)]);
    expect(await db.application.count({ where: { userId: user.id } })).toBe(2);
  });
});

describe("user authorization", () => {
  it("rejects unauthenticated requests and isolates documents between users", async () => {
    const { GET } = await import("@/app/api/documents/[id]/route");
    const a = await seed(email());
    const doc = await db.applicationDocument.findFirstOrThrow({ where: { applicationId: a.app.id } });
    const call = () => GET(new Request("http://t/api/documents/x"), { params: Promise.resolve({ id: doc.id }) });

    sessionUserId = null;
    expect((await call()).status).toBe(401);

    const b = await seed(email());
    sessionUserId = b.user.id;
    expect((await call()).status).toBe(404);

    sessionUserId = a.user.id;
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("application actions are scoped to the owner", async () => {
    const { POST } = await import("@/app/api/applications/[id]/[action]/route");
    const a = await seed(email());
    const b = await seed(email());
    sessionUserId = b.user.id;
    const res = await POST(new Request("http://t", { method: "POST" }), { params: Promise.resolve({ id: a.app.id, action: "cancel" }) });
    expect(res.status).toBe(404);
    expect((await db.application.findUniqueOrThrow({ where: { id: a.app.id } })).status).toBe("READY_TO_SUBMIT");
  });
});

describe("pause and cancellation", () => {
  it("gate: running runs, paused delays, stopped/idle drops, manual always runs", () => {
    expect(gateDecision("RUNNING", false)).toBe("run");
    expect(gateDecision("PAUSED", false)).toBe("delay");
    expect(gateDecision("STOPPED", false)).toBe("stop");
    expect(gateDecision("IDLE", false)).toBe("stop");
    expect(gateDecision(undefined, false)).toBe("stop");
    expect(gateDecision("STOPPED", true)).toBe("run");
  });

  it("a cancelled application is never submitted", async () => {
    const { app } = await seed(email());
    await db.application.update({ where: { id: app.id }, data: { status: "CANCELLED" } });
    const adapter = fakeAdapter([ok]);
    expect((await submitApplication(app.id, { adapterFor: () => adapter })).kind).toBe("skipped");
    expect(adapter.calls).toBe(0);
  });
});
