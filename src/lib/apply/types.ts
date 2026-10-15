import type { CandidateProfile } from "@/lib/profile/schema";
import type { FieldAnswer, FormField } from "./form";

export interface ApplyJob {
  id: string;
  title: string;
  company: string;
  jobUrl: string;
  applyUrl: string | null;
  applicationMethod: string;
  atsBoardToken: string | null;
  atsJobId: string | null;
  isMock: boolean;
  sourceKey: string;
}

export interface AdapterContext {
  userId: string;
  profile: CandidateProfile;
  /** Decrypted employer-issued credential for this board, when the user configured one. */
  credential: string | null;
}

export interface SubmitInput {
  job: ApplyJob;
  answers: FieldAnswer[];
  resume: { filename: string; data: Buffer; text: string };
  coverLetter: { filename: string; data: Buffer; text: string } | null;
  idempotencyKey: string;
  ctx: AdapterContext;
}

export type SubmitOutcomeKind = "SUCCESS" | "UNCONFIRMED" | "FAILED" | "BLOCKED";

export interface SubmitOutcome {
  outcome: SubmitOutcomeKind;
  /** True only when the provider response itself proves the application was recorded. */
  confirmed: boolean;
  httpStatus?: number;
  confirmationId?: string | null;
  evidence: Record<string, unknown>;
  error?: string;
  /** Request definitively rejected before processing (e.g. 429) — safe to retry. */
  retryable: boolean;
}

export interface VerifyOutcome {
  status: "CONFIRMED" | "NOT_FOUND" | "UNKNOWN";
  confirmationId?: string | null;
  evidence: Record<string, unknown>;
}

export interface CapabilityInfo {
  jobDiscovery: boolean;
  applicationFormRetrieval: boolean;
  documentUploads: boolean;
  applicationSubmission: boolean;
  confirmationRetrieval: boolean;
  statusUpdates: boolean;
  /** How this was verified — shown verbatim in the UI. */
  verification: string;
  requirements: string;
}

export interface SubmissionAdapter {
  key: string;
  label: string;
  isTest: boolean;
  capabilities: CapabilityInfo;
  getForm(job: ApplyJob, ctx: AdapterContext): Promise<FormField[]>;
  submit(input: SubmitInput): Promise<SubmitOutcome>;
  verify?(input: { job: ApplyJob; idempotencyKey: string; confirmationId: string | null; ctx: AdapterContext }): Promise<VerifyOutcome>;
}
