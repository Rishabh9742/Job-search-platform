import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { putFile, getFile } from "@/lib/storage";
import { decryptString } from "@/lib/crypto";
import { providerByKey } from "@/lib/jobs/registry";
import { tailorResume, type TailoredResume } from "@/lib/documents/tailor";
import { generateCoverLetter } from "@/lib/documents/cover-letter";
import { generateOpenAnswers } from "@/lib/documents/answers";
import { renderLetterDocx, renderLetterPdf, renderResumeDocx, renderResumePdf } from "@/lib/documents/render";
import { mapFormFields, unresolved, type FieldAnswer } from "@/lib/apply/form";
import { chooseAdapter } from "@/lib/apply/registry";
import type { ApplyJob } from "@/lib/apply/types";
import { loadUserContext } from "./context";

export async function loadApplication(applicationId: string) {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { job: true, documents: true, answers: true, attempts: { orderBy: { attemptNumber: "asc" } } } });
  if (!app) throw new Error(`Application ${applicationId} not found`);
  return app;
}

export const toApplyJob = (job: { id: string; title: string; company: string; jobUrl: string; applyUrl: string | null; applicationMethod: string; atsBoardToken: string | null; atsJobId: string | null; isMock: boolean; sourceKey: string }): ApplyJob => ({
  id: job.id,
  title: job.title,
  company: job.company,
  jobUrl: job.jobUrl,
  applyUrl: job.applyUrl,
  applicationMethod: job.applicationMethod,
  atsBoardToken: job.atsBoardToken,
  atsJobId: job.atsJobId,
  isMock: job.isMock,
  sourceKey: job.sourceKey,
});

const setStatus = (id: string, data: Prisma.ApplicationUpdateInput) => db.application.update({ where: { id }, data });

/** Stage: confirm the listing is still open before spending effort on it. */
export async function verifyListing(applicationId: string): Promise<"ACTIVE" | "CLOSED" | "UNKNOWN"> {
  const app = await loadApplication(applicationId);
  await setStatus(app.id, { status: "PREPARING" });
  const provider = providerByKey(app.job.sourceKey);
  let state: "ACTIVE" | "CLOSED" | "UNKNOWN" = "UNKNOWN";
  if (provider?.checkAvailability && !app.job.isMock) {
    try {
      state = await provider.checkAvailability(app.job);
    } catch {
      state = "UNKNOWN";
    }
  }
  await db.job.update({ where: { id: app.jobId }, data: { lastVerifiedAt: new Date(), ...(state === "CLOSED" ? { status: "CLOSED" } : state === "ACTIVE" ? { status: "ACTIVE" } : {}) } });
  if (state === "CLOSED") {
    await setStatus(app.id, { status: "CANCELLED", error: "Listing closed before submission" });
    await audit(app.userId, "application.cancelled_closed", { type: "Application", id: app.id });
  }
  return state;
}

/** Stage: tailored resume (PDF + DOCX) saved as a ResumeVersion linked to the job. */
export async function generateResumeStage(applicationId: string) {
  const app = await loadApplication(applicationId);
  const { profile } = await loadUserContext(app.userId);
  if (!profile) throw new Error("Profile missing");
  const master = await db.masterResume.findFirst({ where: { userId: app.userId, isActive: true }, orderBy: { createdAt: "desc" } });
  const job = { title: app.job.title, company: app.job.company, description: app.job.description, tags: app.job.tags };
  const { resume, generator, issues } = await tailorResume(profile, job);
  const [pdf, docx] = await Promise.all([renderResumePdf(resume), renderResumeDocx(resume)]);
  const [pdfKey, docxKey] = await Promise.all([putFile(app.userId, "pdf", pdf), putFile(app.userId, "docx", docx)]);
  const version = await db.resumeVersion.create({
    data: { userId: app.userId, masterResumeId: master?.id, jobId: app.jobId, content: resume as unknown as Prisma.InputJsonValue, pdfKey, docxKey, generator, consistencyReport: { issues } as unknown as Prisma.InputJsonValue },
  });
  for (const [format, key] of [["PDF", pdfKey], ["DOCX", docxKey]] as const) {
    await db.applicationDocument.upsert({
      where: { applicationId_kind_format: { applicationId, kind: "RESUME", format } },
      create: { applicationId, kind: "RESUME", format, storageKey: key, resumeVersionId: version.id },
      update: { storageKey: key, resumeVersionId: version.id },
    });
  }
  return { versionId: version.id, issues: issues.length };
}

async function latestTailored(applicationId: string): Promise<TailoredResume> {
  const doc = await db.applicationDocument.findFirst({ where: { applicationId, kind: "RESUME", format: "PDF" } });
  const version = doc?.resumeVersionId ? await db.resumeVersion.findUnique({ where: { id: doc.resumeVersionId } }) : null;
  if (!version) throw new Error("Tailored resume not generated yet");
  return version.content as unknown as TailoredResume;
}

/** Stage: cover letter (PDF + DOCX + text). */
export async function generateCoverLetterStage(applicationId: string) {
  const app = await loadApplication(applicationId);
  const { profile } = await loadUserContext(app.userId);
  if (!profile) throw new Error("Profile missing");
  const resume = await latestTailored(applicationId);
  const job = { title: app.job.title, company: app.job.company, description: app.job.description, tags: app.job.tags };
  const letter = await generateCoverLetter(profile, job, resume);
  const title = `Cover letter — ${app.job.title} at ${app.job.company}`;
  const [pdf, docx] = await Promise.all([renderLetterPdf(letter.text, title), renderLetterDocx(letter.text, title)]);
  const [pdfKey, docxKey] = await Promise.all([putFile(app.userId, "pdf", pdf), putFile(app.userId, "docx", docx)]);
  for (const [format, key, text] of [["PDF", pdfKey, null], ["DOCX", docxKey, null], ["TEXT", null, letter.text]] as const) {
    await db.applicationDocument.upsert({
      where: { applicationId_kind_format: { applicationId, kind: "COVER_LETTER", format } },
      create: { applicationId, kind: "COVER_LETTER", format, storageKey: key, textContent: text },
      update: { storageKey: key, textContent: text },
    });
  }
  return { generator: letter.generator, issues: letter.issues };
}

async function credentialFor(userId: string, job: ApplyJob): Promise<string | null> {
  if (!job.atsBoardToken) return null;
  const provider = job.applicationMethod === "GREENHOUSE" ? "GREENHOUSE" : job.applicationMethod === "LEVER" ? "LEVER" : null;
  if (!provider) return null;
  const cred = await db.providerCredential.findUnique({ where: { userId_provider_boardToken: { userId, provider, boardToken: job.atsBoardToken } } });
  return cred ? decryptString(cred.encryptedSecret) : null;
}

export async function adapterContext(userId: string, job: ApplyJob) {
  const { profile, prefs } = await loadUserContext(userId);
  const credential = await credentialFor(userId, job);
  return { profile: profile!, prefs: prefs!, credential, choice: chooseAdapter(job, prefs!.submissionMode, !!credential) };
}

export type PrepareResult = { state: "READY" } | { state: "MANUAL"; reason: string; pending: number };

/**
 * Stage: choose the submission route, retrieve the real form, and map every
 * field. Unsupported routes and unanswerable questions become manual tasks.
 */
export async function prepareApplication(applicationId: string): Promise<PrepareResult> {
  const app = await loadApplication(applicationId);
  const job = toApplyJob(app.job);
  const { profile, prefs, credential, choice } = await adapterContext(app.userId, job);

  if (!profile.verified) {
    await setStatus(app.id, { status: "MANUAL_ACTION_REQUIRED", manualReason: "Verify your profile (Resume Studio) before applications can be submitted." });
    return { state: "MANUAL", reason: "profile not verified", pending: 0 };
  }
  if (!choice.adapter) {
    await setStatus(app.id, { status: "MANUAL_ACTION_REQUIRED", manualReason: choice.reason, adapter: "manual" });
    await notify(app.userId, "manual_action", `Apply manually: ${app.job.title} at ${app.job.company}`, choice.reason, `/applications/${app.id}`);
    await audit(app.userId, "application.manual_required", { type: "Application", id: app.id }, { reason: choice.reason });
    return { state: "MANUAL", reason: choice.reason, pending: 0 };
  }
  const adapter = choice.adapter;
  const hasCover = app.documents.some((d) => d.kind === "COVER_LETTER");
  if (prefs.requireCoverLetter && !hasCover) throw new Error("Cover letter required but not generated");

  let fields;
  try {
    fields = await adapter.getForm(job, { userId: app.userId, profile, credential });
  } catch (err) {
    const msg = (err as Error).message;
    if (/404|no longer exists/i.test(msg)) {
      await db.job.update({ where: { id: app.jobId }, data: { status: "CLOSED" } });
      await setStatus(app.id, { status: "CANCELLED", error: "Listing closed (form not found)" });
      return { state: "MANUAL", reason: "closed", pending: 0 };
    }
    throw err;
  }

  const userAnswers = Object.fromEntries(app.answers.filter((a) => a.source === "USER" && a.answer != null).map((a) => [a.questionKey, a.answer!]));
  const tailored = await latestTailored(applicationId);
  const needsOpen = fields.some((f) => /about yourself|why/i.test(f.label));
  const open = needsOpen ? (await generateOpenAnswers(profile, { title: app.job.title, company: app.job.company, description: app.job.description, tags: app.job.tags }, tailored)).answers : {};
  const answers = mapFormFields(fields, {
    profile,
    jobCountries: app.job.countries,
    jobTitle: app.job.title,
    company: app.job.company,
    hasResume: true,
    hasCoverLetter: hasCover,
    userAnswers,
    openAnswers: open,
  });
  await saveAnswers(app.id, answers);
  const pending = unresolved(answers);
  if (pending.length) {
    const reason = `${pending.length} question(s) need your input: ${pending.slice(0, 3).map((p) => p.label).join("; ")}${pending.length > 3 ? "…" : ""}`;
    await setStatus(app.id, { status: "MANUAL_ACTION_REQUIRED", manualReason: reason, adapter: adapter.key, isTest: adapter.isTest });
    await notify(app.userId, "input_needed", `Input needed: ${app.job.title} at ${app.job.company}`, reason, `/applications/${app.id}`);
    return { state: "MANUAL", reason, pending: pending.length };
  }
  await setStatus(app.id, { status: "READY_TO_SUBMIT", manualReason: null, adapter: adapter.key, isTest: adapter.isTest });
  return { state: "READY" };
}

async function saveAnswers(applicationId: string, answers: FieldAnswer[]) {
  for (const a of answers) {
    const data = {
      questionLabel: a.label.slice(0, 1000),
      fieldType: a.type,
      required: a.required,
      answer: a.value,
      source: a.source,
      sensitive: a.sensitive,
      requiresUserInput: a.requiresUserInput && !a.value,
      options: (a.options ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    await db.applicationAnswer.upsert({
      where: { applicationId_questionKey: { applicationId, questionKey: a.key } },
      create: { applicationId, questionKey: a.key, ...data },
      update: data,
    });
  }
}

export async function loadDocumentsForSubmit(applicationId: string) {
  const docs = await db.applicationDocument.findMany({ where: { applicationId } });
  const resumePdf = docs.find((d) => d.kind === "RESUME" && d.format === "PDF");
  const coverPdf = docs.find((d) => d.kind === "COVER_LETTER" && d.format === "PDF");
  const coverText = docs.find((d) => d.kind === "COVER_LETTER" && d.format === "TEXT");
  if (!resumePdf?.storageKey) throw new Error("Tailored resume missing");
  const version = resumePdf.resumeVersionId ? await db.resumeVersion.findUnique({ where: { id: resumePdf.resumeVersionId } }) : null;
  const resumeText = version ? JSON.stringify(version.content) : "";
  return {
    resume: { data: await getFile(resumePdf.storageKey), text: resumeText },
    coverLetter: coverPdf?.storageKey ? { data: await getFile(coverPdf.storageKey), text: coverText?.textContent ?? "" } : null,
  };
}
