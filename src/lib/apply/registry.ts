import type { SubmissionMode } from "@prisma/client";
import type { ApplyJob, CapabilityInfo, SubmissionAdapter } from "./types";
import { greenhouseApiAdapter } from "./adapters/greenhouse";
import { leverApiAdapter } from "./adapters/lever";
import { sandboxAdapter } from "./adapters/sandbox";

export const ADAPTERS: SubmissionAdapter[] = [greenhouseApiAdapter, leverApiAdapter, sandboxAdapter];

/** Integrations that are intentionally NOT automated, with the reason shown to users. */
export const UNSUPPORTED: { key: string; label: string; capabilities: CapabilityInfo }[] = [
  {
    key: "browser-automation",
    label: "Browser automation of hosted application pages (Greenhouse/Lever/Ashby/Workday hosted forms)",
    capabilities: {
      jobDiscovery: false,
      applicationFormRetrieval: false,
      documentUploads: false,
      applicationSubmission: false,
      confirmationRetrieval: false,
      statusUpdates: false,
      verification: "Not implemented by design.",
      requirements:
        "Hosted application pages are protected by CAPTCHA / anti-automation controls (e.g. reCAPTCHA on Greenhouse, hCaptcha on Lever). JobPilot does not bypass these; such jobs become manual-action tasks with prepared documents.",
    },
  },
  {
    key: "ashby",
    label: "Ashby application submission",
    capabilities: {
      jobDiscovery: true,
      applicationFormRetrieval: false,
      documentUploads: false,
      applicationSubmission: false,
      confirmationRetrieval: false,
      statusUpdates: false,
      verification: "Discovery tested live; no third-party submission API available.",
      requirements: "Manual application via the official Ashby link.",
    },
  },
  {
    key: "aggregators",
    label: "Aggregator listings (Adzuna, Remotive, Arbeitnow, USAJOBS)",
    capabilities: {
      jobDiscovery: true,
      applicationFormRetrieval: false,
      documentUploads: false,
      applicationSubmission: false,
      confirmationRetrieval: false,
      statusUpdates: false,
      verification: "Discovery only — these are search APIs, not application APIs.",
      requirements: "Manual application via the original listing URL.",
    },
  },
];

export const adapterByKey = (key: string) => ADAPTERS.find((a) => a.key === key);

export type AdapterChoice = { adapter: SubmissionAdapter; reason: string } | { adapter: null; reason: string };

/** Decide how an application can be submitted. Never picks a live route without credentials. */
export function chooseAdapter(job: ApplyJob, mode: SubmissionMode, hasCredential: boolean): AdapterChoice {
  if (job.isMock) return { adapter: sandboxAdapter, reason: "Mock listing — routed to the sandbox ATS" };
  if (mode === "SANDBOX") return { adapter: sandboxAdapter, reason: "Submission mode is SANDBOX — real listing, test submission" };
  if (job.applicationMethod === "GREENHOUSE" && job.atsBoardToken && job.atsJobId) {
    if (hasCredential) return { adapter: greenhouseApiAdapter, reason: "Employer Greenhouse API key configured" };
    return { adapter: null, reason: "This employer's Greenhouse board only accepts API submissions with the employer's own key, and its hosted form is CAPTCHA-protected. Apply manually with the prepared documents." };
  }
  if (job.applicationMethod === "LEVER" && job.atsBoardToken && job.atsJobId) {
    if (hasCredential) return { adapter: leverApiAdapter, reason: "Employer Lever API key configured" };
    return { adapter: null, reason: "Lever submission requires an employer-issued API key; the hosted form is CAPTCHA-protected. Apply manually with the prepared documents." };
  }
  if (job.applicationMethod === "ASHBY") return { adapter: null, reason: "Ashby has no third-party submission API. Apply manually with the prepared documents." };
  return { adapter: null, reason: `${job.sourceKey} is a search source without an application API. Apply on the original listing with the prepared documents.` };
}
