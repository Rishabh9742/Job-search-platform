import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(d: Date | string | null | undefined, withTime = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

export function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "unknown";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fmtSalary(j: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryPeriod: string | null; salaryText: string | null }) {
  if (j.salaryMin != null) {
    const cur = j.salaryCurrency ?? "";
    const f = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
    const range = j.salaryMax && j.salaryMax !== j.salaryMin ? `${f(j.salaryMin)}–${f(j.salaryMax)}` : f(j.salaryMin);
    const per = j.salaryPeriod === "HOUR" ? "/hr" : j.salaryPeriod === "MONTH" ? "/mo" : j.salaryPeriod === "YEAR" ? "/yr" : "";
    return `${cur ? `${cur} ` : ""}${range}${per}${cur ? "" : " (currency not stated)"}`;
  }
  if (j.salaryText) return `${j.salaryText} (as stated)`;
  return "Salary not provided";
}

export const STATUS_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  PREPARING: "Preparing",
  READY_TO_SUBMIT: "Ready to submit",
  SUBMITTING: "Submitting",
  SUBMITTED_CONFIRMED: "Submitted & confirmed",
  SUBMISSION_UNCONFIRMED: "Submission unconfirmed",
  MANUAL_ACTION_REQUIRED: "Manual action required",
  FAILED: "Failed",
  RETRY_ELIGIBLE: "Retry eligible",
  CANCELLED: "Cancelled",
};

export const STATUS_TONE: Record<string, "default" | "success" | "warning" | "destructive" | "muted" | "info"> = {
  QUEUED: "muted",
  PREPARING: "info",
  READY_TO_SUBMIT: "info",
  SUBMITTING: "info",
  SUBMITTED_CONFIRMED: "success",
  SUBMISSION_UNCONFIRMED: "warning",
  MANUAL_ACTION_REQUIRED: "warning",
  FAILED: "destructive",
  RETRY_ELIGIBLE: "warning",
  CANCELLED: "muted",
};
