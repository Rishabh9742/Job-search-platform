import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { ActionButton, AutoRefresh } from "@/components/client";
import { StatusBadge } from "@/components/application-row";
import { SourceBadge } from "@/components/job-bits";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { OutcomeSelect, PendingAnswersForm, type PendingQuestion } from "./client";

const ACTIVE = ["QUEUED", "PREPARING", "READY_TO_SUBMIT", "SUBMITTING", "SUBMISSION_UNCONFIRMED"];

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const app = await db.application.findFirst({
    where: { id, userId: user.id },
    include: { job: true, documents: true, answers: { orderBy: { questionKey: "asc" } }, attempts: { orderBy: { attemptNumber: "asc" } }, confirmation: true },
  });
  if (!app) notFound();
  const pending = app.answers.filter((a) => a.requiresUserInput && !a.answer);
  const doc = (kind: string, format: string) => app.documents.find((d) => d.kind === kind && d.format === format);
  const coverText = doc("COVER_LETTER", "TEXT")?.textContent;
  const unsafe = app.attempts.some((a) => ["IN_PROGRESS", "SUCCESS", "UNCONFIRMED"].includes(a.outcome));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {ACTIVE.includes(app.status) && <AutoRefresh ms={4000} />}
      <div>
        <Link href="/applications" className="text-sm text-muted-foreground hover:underline">
          ← Application Tracker
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{app.job.title}</h1>
          <StatusBadge status={app.status} isTest={app.isTest} />
        </div>
        <p className="text-muted-foreground">
          {app.job.company} · <SourceBadge source={app.job.sourceKey} isMock={app.job.isMock} /> · created {fmtDate(app.createdAt, true)}
        </p>
      </div>

      {app.isTest && <Alert tone="info" title="Test submission">This application was routed to the built-in sandbox ATS. It was NOT sent to {app.job.company}.</Alert>}
      {app.status === "MANUAL_ACTION_REQUIRED" && (
        <Alert tone="warning" title="Your action is needed">
          {app.manualReason}
        </Alert>
      )}
      {app.status === "SUBMISSION_UNCONFIRMED" && (
        <Alert tone="warning" title="Submission not confirmed">
          The request was sent but the response did not prove receipt. Check your email or the employer portal. It will not be re-sent automatically.
        </Alert>
      )}
      {app.error && app.status !== "SUBMITTED_CONFIRMED" && <Alert tone="destructive" title="Last error">{app.error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href={app.job.applyUrl ?? app.job.jobUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> Official application page
          </a>
        </Button>
        {(app.status === "RETRY_ELIGIBLE" || ((app.status === "FAILED" || app.status === "CANCELLED") && !unsafe)) && (
          <ActionButton url={`/api/applications/${app.id}/retry`}>Retry</ActionButton>
        )}
        {app.status === "SUBMISSION_UNCONFIRMED" && (
          <ActionButton url={`/api/applications/${app.id}/verify`} variant="outline">
            Check confirmation again
          </ActionButton>
        )}
        {["MANUAL_ACTION_REQUIRED", "SUBMISSION_UNCONFIRMED", "FAILED"].includes(app.status) && (
          <ActionButton url={`/api/applications/${app.id}/mark-applied`} variant="success" confirmText="Only confirm if you completed the application on the employer's site.">
            I applied manually
          </ActionButton>
        )}
        {!["SUBMITTING", "SUBMITTED_CONFIRMED", "CANCELLED"].includes(app.status) && (
          <ActionButton url={`/api/applications/${app.id}/cancel`} variant="ghost">
            Cancel
          </ActionButton>
        )}
      </div>

      {pending.length > 0 && app.status === "MANUAL_ACTION_REQUIRED" && (
        <Card>
          <CardHeader>
            <CardTitle>Questions needing your answers</CardTitle>
            <CardDescription>After you answer, the application is prepared again and submitted through the same supported integration.</CardDescription>
          </CardHeader>
          <CardContent>
            <PendingAnswersForm
              applicationId={app.id}
              questions={pending.map<PendingQuestion>((a) => ({ key: a.questionKey, label: a.questionLabel, type: a.fieldType, required: a.required, sensitive: a.sensitive, options: (a.options as PendingQuestion["options"]) ?? null }))}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Prepared documents</CardTitle>
            <CardDescription>Tailored for this job from your verified profile.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {app.documents.length === 0 && <p className="text-muted-foreground">Not generated yet.</p>}
            {(["RESUME", "COVER_LETTER"] as const).map((kind) =>
              doc(kind, "PDF") ? (
                <div key={kind} className="flex items-center gap-3">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="flex-1">{kind === "RESUME" ? "Tailored resume" : "Cover letter"}</span>
                  <a className="text-primary hover:underline" href={`/api/documents/${doc(kind, "PDF")!.id}`} target="_blank">
                    PDF
                  </a>
                  {doc(kind, "DOCX") && (
                    <a className="text-primary hover:underline" href={`/api/documents/${doc(kind, "DOCX")!.id}`}>
                      DOCX
                    </a>
                  )}
                </div>
              ) : null,
            )}
            {coverText && (
              <details className="rounded-md border p-2">
                <summary className="cursor-pointer text-xs font-medium">Preview cover letter</summary>
                <div className="prose-job mt-2 text-xs">{coverText}</div>
              </details>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcome</CardTitle>
            <CardDescription>Update when you hear back. JobPilot does not receive interview or rejection updates automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <OutcomeSelect applicationId={app.id} value={app.outcome} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submission attempts & evidence</CardTitle>
          <CardDescription>A click is not proof — only provider responses or status checks mark an application confirmed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {app.attempts.length === 0 && <p className="text-muted-foreground">No submission attempts yet.</p>}
          {app.attempts.map((t) => (
            <div key={t.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Attempt {t.attemptNumber}</span>
                <Badge tone={t.outcome === "SUCCESS" ? "success" : t.outcome === "FAILED" ? "destructive" : "warning"}>{t.outcome.toLowerCase()}</Badge>
                <span className="text-xs text-muted-foreground">
                  via {t.adapter}
                  {t.isTest && " (test)"} · {fmtDate(t.startedAt, true)}
                  {t.httpStatus && ` · HTTP ${t.httpStatus}`}
                </span>
              </div>
              {t.error && <p className="mt-1 text-xs text-destructive">{t.error}</p>}
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">idempotency key {t.idempotencyKey.slice(0, 16)}…</p>
              {t.responseSummary && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs">Provider response</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(t.responseSummary, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
          {app.confirmation && (
            <Alert tone="success" title={`Confirmed via ${app.confirmation.method.replace("_", " ").toLowerCase()}`}>
              {fmtDate(app.confirmation.confirmedAt, true)}
              {app.confirmation.confirmationId && (
                <>
                  {" "}· confirmation <span className="font-mono">{app.confirmation.confirmationId}</span>
                </>
              )}
            </Alert>
          )}
        </CardContent>
      </Card>

      {app.answers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Application form answers</CardTitle>
            <CardDescription>Source of every value. Sensitive questions are never auto-answered.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Question</th>
                  <th className="pr-3">Answer</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {app.answers.map((a) => {
                  const opt = ((a.options as { label: string; value: string }[] | null) ?? []).find((o) => o.value === a.answer);
                  return (
                    <tr key={a.id} className="border-t align-top">
                      <td className="py-2 pr-3">
                        {a.questionLabel}
                        {a.required && <span className="text-destructive"> *</span>}
                      </td>
                      <td className="max-w-xs py-2 pr-3 text-muted-foreground">{opt?.label ?? (a.answer ? (a.answer.length > 160 ? `${a.answer.slice(0, 160)}…` : a.answer) : "—")}</td>
                      <td className="py-2">
                        <Badge tone={a.requiresUserInput && !a.answer ? "warning" : "muted"}>{a.requiresUserInput && !a.answer ? "needs you" : a.source.toLowerCase().replace("_", " ")}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
