import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ExternalLink, XCircle, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { countryName, REGION_LABELS } from "@/lib/taxonomy/countries";
import { fmtDate, fmtSalary, STATUS_LABELS } from "@/lib/utils";
import { ActionButton } from "@/components/client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui";
import { LocationLine, ScoreBadge, SourceBadge } from "@/components/job-bits";

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [job, match, app] = await Promise.all([
    db.job.findUnique({ where: { id } }),
    db.jobMatch.findUnique({ where: { userId_jobId: { userId: user.id, jobId: id } } }),
    db.application.findFirst({ where: { userId: user.id, jobId: id } }),
  ]);
  if (!job) notFound();
  const breakdown = (match?.breakdown ?? []) as { factor: string; weight: number; points: number; detail: string }[];
  const reasons = (match?.reasons ?? { included: [], excluded: [] }) as { included: string[]; excluded: string[] };

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <div>
          <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
            ← Find Jobs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{job.title}</h1>
          <p className="text-lg">{job.company}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <SourceBadge source={job.sourceKey} isMock={job.isMock} />
            <LocationLine job={job} />
            {job.status === "CLOSED" && <Badge tone="destructive">Closed</Badge>}
          </div>
        </div>
        <Card>
          <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Salary: </span>{fmtSalary(job)}</div>
            <div><span className="text-muted-foreground">Posted: </span>{job.postedAt ? fmtDate(job.postedAt) : "Not provided by source"}</div>
            <div><span className="text-muted-foreground">Employment type: </span>{job.employmentType?.replace("_", "-").toLowerCase() ?? "Not stated"}</div>
            <div><span className="text-muted-foreground">Seniority: </span>{job.experienceLevel?.toLowerCase() ?? "Not stated"}</div>
            <div><span className="text-muted-foreground">Countries: </span>{job.countries.length ? job.countries.map(countryName).join(", ") : "Not stated"}</div>
            <div><span className="text-muted-foreground">Remote eligibility: </span>{job.remoteRegions.length ? job.remoteRegions.map((r) => REGION_LABELS[r] ?? r).join(", ") : job.isRemote ? "Not stated" : "—"}</div>
            <div><span className="text-muted-foreground">Application method: </span>{job.applicationMethod.replace("_", " ").toLowerCase()}</div>
            <div><span className="text-muted-foreground">Last verified: </span>{job.lastVerifiedAt ? fmtDate(job.lastVerifiedAt, true) : "Not yet"} · seen {fmtDate(job.lastSeenAt, true)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Job description</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose-job text-sm">{job.description || "No description provided by the source."}</div>
            {(job.raw as { descriptionTruncated?: boolean } | null)?.descriptionTruncated && <p className="mt-3 text-xs text-muted-foreground">This source only provides a snippet. Read the full listing on the original site.</p>}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-4">
            <Button className="w-full" variant="outline" asChild>
              <a href={job.jobUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> View original listing
              </a>
            </Button>
            {job.applyUrl && job.applyUrl !== job.jobUrl && (
              <Button className="w-full" variant="outline" asChild>
                <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Official application page
                </a>
              </Button>
            )}
            {app ? (
              <Link href={`/applications/${app.id}`} className="block rounded-md border p-2 text-center text-sm hover:bg-accent">
                Application: {STATUS_LABELS[app.status]}
              </Link>
            ) : (
              match?.eligible && job.status !== "CLOSED" && (
                <ActionButton url={`/api/jobs/${job.id}/apply`} className="w-full">
                  Prepare & apply
                </ActionButton>
              )
            )}
            <p className="text-xs text-muted-foreground">Source attribution: this listing was retrieved from {job.sourceKey} and links to the original posting.</p>
          </CardContent>
        </Card>

        {match ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Match score</CardTitle>
              <ScoreBadge score={match.score} eligible={match.eligible} />
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2">
                {breakdown.map((b) => (
                  <div key={b.factor}>
                    <div className="flex justify-between text-xs">
                      <span>{b.factor}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {b.points}/{b.weight}
                      </span>
                    </div>
                    <Progress value={(b.points / b.weight) * 100} className="h-1.5" />
                    <p className="text-xs text-muted-foreground">{b.detail}</p>
                  </div>
                ))}
              </div>
              {reasons.included.length > 0 && (
                <ul className="space-y-1">
                  {reasons.included.map((r) => (
                    <li key={r} className="flex gap-2 text-xs"><CheckCircle2 className="size-3.5 shrink-0 text-success" />{r}</li>
                  ))}
                </ul>
              )}
              {reasons.excluded.length > 0 && (
                <ul className="space-y-1">
                  {reasons.excluded.map((r) => (
                    <li key={r} className="flex gap-2 text-xs"><XCircle className="size-3.5 shrink-0 text-destructive" />{r}</li>
                  ))}
                </ul>
              )}
              {match.blockers.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium">Blocks automatic submission</p>
                  <ul className="space-y-1">
                    {match.blockers.map((r) => (
                      <li key={r} className="flex gap-2 text-xs"><AlertTriangle className="size-3.5 shrink-0 text-warning" />{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {match.missingSkills.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium">Required skills not in your profile</p>
                  <div className="flex flex-wrap gap-1">
                    {match.missingSkills.map((s) => (
                      <Badge key={s} tone="muted">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">The score reflects stated requirements vs. your verified profile. It is not a prediction of hiring success.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">Not scored against your profile yet.</CardContent>
          </Card>
        )}
      </aside>
    </div>
  );
}
