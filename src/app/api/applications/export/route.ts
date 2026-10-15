import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withUser } from "@/lib/api";

const esc = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const GET = withUser(async (_req, user) => {
  const apps = await db.application.findMany({ where: { userId: user.id }, include: { job: true, confirmation: true }, orderBy: { createdAt: "desc" } });
  const header = ["created_at", "status", "test_submission", "job_title", "company", "location", "countries", "source", "job_url", "adapter", "submitted_at", "confirmed_at", "confirmation_method", "confirmation_id", "outcome", "error"];
  const rows = apps.map((a) => [a.createdAt, a.status, a.isTest, a.job.title, a.job.company, a.job.locationText, a.job.countries.join(" "), a.job.sourceKey, a.job.jobUrl, a.adapter, a.submittedAt, a.confirmedAt, a.confirmation?.method, a.confirmation?.confirmationId, a.outcome, a.error ?? a.manualReason]);
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="jobpilot-applications-${new Date().toISOString().slice(0, 10)}.csv"` } });
});
