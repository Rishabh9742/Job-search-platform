import crypto from "node:crypto";
import { env } from "@/lib/env";
import { GH_API } from "@/lib/jobs/providers/greenhouse";
import type { FormField } from "../form";
import type { SubmissionAdapter } from "../types";
import { fetchGreenhouseForm, postGreenhouseApplication } from "./greenhouse";

/** Per-install secret for the sandbox ATS (derived, never shown). */
export function sandboxApiKey() {
  return crypto.createHmac("sha256", env().ENCRYPTION_KEY || "dev").update("jobpilot-sandbox-ats").digest("hex");
}

export const sandboxBaseUrl = () => `${env().APP_URL.replace(/\/$/, "")}/api/sandbox/ats/boards`;

/** Form used for listings whose real form cannot be retrieved (non-Greenhouse sources). */
export const SANDBOX_DEFAULT_FORM: FormField[] = [
  { key: "first_name", label: "First Name", type: "text", required: true },
  { key: "last_name", label: "Last Name", type: "text", required: true },
  { key: "email", label: "Email", type: "text", required: true },
  { key: "phone", label: "Phone", type: "text", required: false },
  { key: "resume", label: "Resume/CV", type: "file", required: true, alternatives: ["resume_text"] },
  { key: "cover_letter", label: "Cover Letter", type: "file", required: false, alternatives: ["cover_letter_text"] },
  { key: "question_linkedin", label: "LinkedIn Profile", type: "text", required: false },
];

/**
 * Built-in test ATS. It speaks the Greenhouse Job Board API contract, so a
 * sandbox submission exercises the same request-building, upload, validation,
 * and response-handling code as a live Greenhouse submission — without
 * contacting any employer. For real Greenhouse listings the sandbox serves the
 * job's REAL application form so field mapping is tested on genuine questions.
 */
export const sandboxAdapter: SubmissionAdapter = {
  key: "sandbox",
  label: "Sandbox ATS (test environment)",
  isTest: true,
  capabilities: {
    jobDiscovery: false,
    applicationFormRetrieval: true,
    documentUploads: true,
    applicationSubmission: true,
    confirmationRetrieval: true,
    statusUpdates: false,
    verification: "Fully exercised end-to-end (HTTP multipart upload, validation, confirmation id, status lookup). Test environment only — nothing is sent to employers.",
    requirements: "None. Default submission mode until you switch to LIVE.",
  },
  async getForm(job) {
    if (job.applicationMethod === "GREENHOUSE" && job.atsBoardToken && job.atsJobId && !job.isMock) {
      try {
        return await fetchGreenhouseForm(GH_API, job.atsBoardToken, job.atsJobId);
      } catch (err) {
        console.warn("[sandbox] real form unavailable, using default:", (err as Error).message);
      }
    }
    return SANDBOX_DEFAULT_FORM;
  },
  async submit(input) {
    const board = input.job.atsBoardToken ?? input.job.sourceKey;
    const jobRef = input.job.atsJobId ?? input.job.id;
    const url = `${sandboxBaseUrl()}/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobRef)}`;
    const required = input.answers.filter((a) => a.required && a.type !== "file" && a.type !== "hidden").map((a) => a.key);
    return postGreenhouseApplication(url, sandboxApiKey(), input, { "Idempotency-Key": input.idempotencyKey, "X-Sandbox-Required": required.join(",") });
  },
  async verify({ idempotencyKey }) {
    const res = await fetch(`${env().APP_URL.replace(/\/$/, "")}/api/sandbox/ats/applications/by-key/${encodeURIComponent(idempotencyKey)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sandboxApiKey()}:`).toString("base64")}` },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!res) return { status: "UNKNOWN", evidence: { error: "sandbox unreachable" } };
    if (res.status === 404) return { status: "NOT_FOUND", evidence: { httpStatus: 404 } };
    if (!res.ok) return { status: "UNKNOWN", evidence: { httpStatus: res.status } };
    const body = (await res.json()) as { confirmation_id: string; created_at: string };
    return { status: "CONFIRMED", confirmationId: body.confirmation_id, evidence: { lookup: body } };
  },
};
