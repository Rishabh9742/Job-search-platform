import { GH_API } from "@/lib/jobs/providers/greenhouse";
import { fetchWithRetry, HttpStatusError } from "@/lib/jobs/http";
import type { FieldType, FormField } from "../form";
import type { ApplyJob, SubmissionAdapter, SubmitInput, SubmitOutcome } from "../types";

interface GhQuestion {
  label: string;
  required: boolean;
  description?: string | null;
  fields: { name: string; type: string; values?: { label: string; value: number | string }[] }[];
}

const TYPE_MAP: Record<string, FieldType> = {
  input_text: "text",
  textarea: "textarea",
  input_file: "file",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
  input_hidden: "hidden",
};

/** Convert Greenhouse question groups into provider-neutral fields. */
export function greenhouseQuestionsToFields(questions: GhQuestion[]): FormField[] {
  return questions.map((q) => {
    const [primary, ...alts] = q.fields;
    let type = TYPE_MAP[primary.type] ?? "text";
    const options = primary.values?.map((v) => ({ label: v.label, value: String(v.value) }));
    if (type === "select" && options?.length === 2 && options.every((o) => /^(yes|no)$/i.test(o.label))) type = "select";
    return {
      key: primary.name,
      label: q.label.trim(),
      type,
      required: q.required,
      options: options?.length ? options : undefined,
      description: q.description?.replace(/<[^>]+>/g, " ").trim() || null,
      alternatives: alts.map((a) => a.name),
    };
  });
}

export async function fetchGreenhouseForm(baseUrl: string, board: string, jobId: string): Promise<FormField[]> {
  const res = await fetchWithRetry(`${baseUrl}/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}?questions=true`, { provider: "greenhouse" });
  if (res.status === 404) throw new Error("Job no longer exists on Greenhouse (404)");
  if (!res.ok) throw new HttpStatusError(res.status, res.url, await res.text());
  const data = (await res.json()) as { questions?: GhQuestion[]; location_questions?: GhQuestion[]; compliance?: { questions?: GhQuestion[] }[] };
  const compliance = (data.compliance ?? []).flatMap((c) => c.questions ?? []);
  return greenhouseQuestionsToFields([...(data.questions ?? []), ...(data.location_questions ?? []), ...compliance]);
}

/**
 * Build the multipart body exactly as the Greenhouse Job Board API expects
 * (POST /v1/boards/{token}/jobs/{id}, multipart/form-data).
 */
export function buildGreenhouseForm(input: SubmitInput): FormData {
  const fd = new FormData();
  for (const a of input.answers) {
    if (a.source === "DOCUMENT" || a.value == null || a.value === "") continue;
    if (a.type === "multiselect") for (const v of a.value.split("|")) fd.append(`${a.key}[]`, v);
    else fd.append(a.key, a.value);
  }
  fd.append("resume", new Blob([new Uint8Array(input.resume.data)], { type: "application/pdf" }), input.resume.filename);
  if (input.coverLetter) fd.append("cover_letter", new Blob([new Uint8Array(input.coverLetter.data)], { type: "application/pdf" }), input.coverLetter.filename);
  return fd;
}

export async function postGreenhouseApplication(url: string, apiKey: string, input: SubmitInput, extraHeaders: Record<string, string> = {}): Promise<SubmitOutcome> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, Accept: "application/json", ...extraHeaders },
      body: buildGreenhouseForm(input),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    // The request may have reached the server: do NOT treat as failure or retry blindly.
    return { outcome: "UNCONFIRMED", confirmed: false, evidence: { networkError: (err as Error).message }, error: `No response received: ${(err as Error).message}`, retryable: false };
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 1000) };
  }
  const evidence = { httpStatus: res.status, body, receivedAt: new Date().toISOString() };
  if (res.ok && typeof body.success === "string") {
    return { outcome: "SUCCESS", confirmed: true, httpStatus: res.status, confirmationId: (body.confirmation_id as string) ?? null, evidence, retryable: false };
  }
  if (res.ok) return { outcome: "UNCONFIRMED", confirmed: false, httpStatus: res.status, evidence, error: "2xx without a success message", retryable: false };
  if (res.status === 429 || res.status === 503) return { outcome: "FAILED", confirmed: false, httpStatus: res.status, evidence, error: `Rejected with ${res.status} (rate limit/unavailable)`, retryable: true };
  if (res.status >= 500) return { outcome: "UNCONFIRMED", confirmed: false, httpStatus: res.status, evidence, error: `Server error ${res.status}; submission state unknown`, retryable: false };
  return { outcome: "FAILED", confirmed: false, httpStatus: res.status, evidence, error: `Rejected (${res.status}): ${String(body.error ?? body.raw ?? "").slice(0, 300)}`, retryable: false };
}

export const greenhouseApiAdapter: SubmissionAdapter = {
  key: "greenhouse-api",
  label: "Greenhouse Job Board API",
  isTest: false,
  capabilities: {
    jobDiscovery: true,
    applicationFormRetrieval: true,
    documentUploads: true,
    applicationSubmission: true,
    confirmationRetrieval: false,
    statusUpdates: false,
    verification:
      "Form retrieval tested live against public boards. Submission is implemented to the documented API contract and exercised end-to-end against the built-in sandbox (identical request format); live submission needs the employer's Job Board API key.",
    requirements: "Employer-issued Greenhouse Job Board API key for that board (Settings → Employer API credentials).",
  },
  async getForm(job: ApplyJob) {
    return fetchGreenhouseForm(GH_API, job.atsBoardToken!, job.atsJobId!);
  },
  async submit(input) {
    if (!input.ctx.credential) return { outcome: "BLOCKED", confirmed: false, evidence: {}, error: "No Greenhouse API key configured for this board", retryable: false };
    return postGreenhouseApplication(`${GH_API}/${encodeURIComponent(input.job.atsBoardToken!)}/jobs/${encodeURIComponent(input.job.atsJobId!)}`, input.ctx.credential, input);
  },
};
