import { LEVER_API } from "@/lib/jobs/providers/lever";
import type { FormField } from "../form";
import type { SubmissionAdapter, SubmitOutcome } from "../types";

/** Fields Lever's Postings API accepts for every posting. */
export const LEVER_STANDARD_FIELDS: FormField[] = [
  { key: "name", label: "Full name", type: "text", required: true },
  { key: "email", label: "Email", type: "text", required: true },
  { key: "phone", label: "Phone", type: "text", required: false },
  { key: "org", label: "Current company", type: "text", required: false },
  { key: "urls[LinkedIn]", label: "LinkedIn URL", type: "text", required: false },
  { key: "urls[GitHub]", label: "GitHub URL", type: "text", required: false },
  { key: "resume", label: "Resume", type: "file", required: true },
  { key: "comments", label: "Cover letter", type: "textarea", required: false },
];

interface LeverApplyForm {
  customQuestions?: { id: string; fields: { type: string; text: string; required: boolean; options?: { text: string }[] }[] }[];
}

export const leverApiAdapter: SubmissionAdapter = {
  key: "lever-api",
  label: "Lever Postings API",
  isTest: false,
  capabilities: {
    jobDiscovery: true,
    applicationFormRetrieval: true,
    documentUploads: true,
    applicationSubmission: true,
    confirmationRetrieval: true,
    statusUpdates: false,
    verification:
      "Discovery tested live. Submission implemented to Lever's documented Postings API contract (POST /v0/postings/{site}/{id}?key=…) with unit-tested request building; NOT exercised against a live employer because it requires an employer-issued key.",
    requirements: "Employer-issued Lever Postings API key for that site (Settings → Employer API credentials).",
  },
  async getForm(job, ctx) {
    if (!ctx.credential) return LEVER_STANDARD_FIELDS;
    const res = await fetch(`${LEVER_API}/${encodeURIComponent(job.atsBoardToken!)}/${encodeURIComponent(job.atsJobId!)}/apply?key=${encodeURIComponent(ctx.credential)}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return LEVER_STANDARD_FIELDS;
    const data = (await res.json()) as LeverApplyForm;
    const custom: FormField[] = (data.customQuestions ?? []).flatMap((card) =>
      card.fields.map((f, i) => ({
        key: `cards[${card.id}][field${i}]`,
        label: f.text,
        type: f.type === "multiple-choice" || f.type === "dropdown" ? ("select" as const) : f.type === "multiple-select" ? ("multiselect" as const) : f.type === "textarea" ? ("textarea" as const) : ("text" as const),
        required: f.required,
        options: f.options?.map((o) => ({ label: o.text, value: o.text })),
      })),
    );
    return [...LEVER_STANDARD_FIELDS, ...custom];
  },
  async submit(input): Promise<SubmitOutcome> {
    if (!input.ctx.credential) return { outcome: "BLOCKED", confirmed: false, evidence: {}, error: "No Lever API key configured for this site", retryable: false };
    const fd = new FormData();
    for (const a of input.answers) {
      if (a.source === "DOCUMENT" || !a.value) continue;
      fd.append(a.key, a.value);
    }
    if (input.coverLetter) fd.set("comments", input.coverLetter.text);
    fd.append("resume", new Blob([new Uint8Array(input.resume.data)], { type: "application/pdf" }), input.resume.filename);
    const url = `${LEVER_API}/${encodeURIComponent(input.job.atsBoardToken!)}/${encodeURIComponent(input.job.atsJobId!)}?key=${encodeURIComponent(input.ctx.credential)}`;
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", body: fd, signal: AbortSignal.timeout(60_000) });
    } catch (err) {
      return { outcome: "UNCONFIRMED", confirmed: false, evidence: { networkError: (err as Error).message }, error: "No response received", retryable: false };
    }
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; applicationId?: string; error?: string };
    const evidence = { httpStatus: res.status, body };
    if (res.ok && body.ok && body.applicationId) return { outcome: "SUCCESS", confirmed: true, httpStatus: res.status, confirmationId: body.applicationId, evidence, retryable: false };
    if (res.status === 429) return { outcome: "FAILED", confirmed: false, httpStatus: 429, evidence, error: "Rate limited", retryable: true };
    if (res.status >= 500 || res.ok) return { outcome: "UNCONFIRMED", confirmed: false, httpStatus: res.status, evidence, error: "Ambiguous response", retryable: false };
    return { outcome: "FAILED", confirmed: false, httpStatus: res.status, evidence, error: body.error ?? `Rejected (${res.status})`, retryable: false };
  },
};
