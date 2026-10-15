import Link from "next/link";
import { Prisma } from "@prisma/client";
import { ExternalLink, RefreshCw, Search, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/taxonomy/categories";
import { COUNTRIES } from "@/lib/taxonomy/countries";
import { fmtSalary, timeAgo } from "@/lib/utils";
import { ActionButton, AutoRefresh } from "@/components/client";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { LocationLine, ScoreBadge, SourceBadge } from "@/components/job-bits";

type SP = Promise<Record<string, string | undefined>>;

export default async function FindJobs({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.JobMatchWhereInput = {
    userId: user.id,
    dismissed: false,
    ...(sp.show !== "all" ? { eligible: true } : {}),
    ...(sp.minScore ? { score: { gte: Number(sp.minScore) } } : {}),
    ...(sp.category ? { matchedCategory: sp.category } : {}),
    job: {
      AND: [
        sp.country ? { OR: [{ countries: { has: sp.country } }, { remoteRegions: { has: "WORLDWIDE" } }] } : {},
        sp.source ? { sourceKey: sp.source } : {},
        sp.remote === "1" ? { isRemote: true } : {},
        sp.q ? { OR: [{ title: { contains: sp.q, mode: "insensitive" as const } }, { company: { contains: sp.q, mode: "insensitive" as const } }] } : {},
      ],
    },
  };
  const [matches, total, totalAll, running, sources, appliedJobIds] = await Promise.all([
    db.jobMatch.findMany({ where, include: { job: true }, orderBy: [{ score: "desc" }, { updatedAt: "desc" }], take: 30, skip: (page - 1) * 30 }),
    db.jobMatch.count({ where }),
    db.jobMatch.count({ where: { userId: user.id } }),
    db.backgroundTask.findFirst({ where: { userId: user.id, queue: { in: ["job-discovery", "matching"] }, status: { in: ["QUEUED", "ACTIVE"] } } }),
    db.job.groupBy({ by: ["sourceKey"], _count: true }),
    db.application.findMany({ where: { userId: user.id }, select: { jobId: true, status: true } }),
  ]);
  const applied = new Map(appliedJobIds.map((a) => [a.jobId, a.status]));
  const qs = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/jobs?${u}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      {running && <AutoRefresh ms={4000} />}
      <PageHeader
        title="Find Jobs"
        description={`${total} ${sp.show === "all" ? "evaluated" : "eligible"} matches · ${totalAll} evaluated in total. Scores explain relevance; they do not predict hiring outcomes.`}
        actions={
          <ActionButton url="/api/jobs/search" disabled={!!running}>
            <RefreshCw className={running ? "animate-spin" : ""} /> {running ? "Searching…" : "Search now"}
          </ActionButton>
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7" action="/jobs">
        <Input name="q" placeholder="Title or company" defaultValue={sp.q} aria-label="Search title or company" className="lg:col-span-2" />
        <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select name="country" defaultValue={sp.country ?? ""} aria-label="Country">
          <option value="">All countries</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="source" defaultValue={sp.source ?? ""} aria-label="Source">
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.sourceKey} value={s.sourceKey}>
              {s.sourceKey} ({s._count})
            </option>
          ))}
        </Select>
        <Select name="show" defaultValue={sp.show ?? ""} aria-label="Eligibility">
          <option value="">Eligible only</option>
          <option value="all">Include excluded</option>
        </Select>
        <Button type="submit" variant="secondary">
          <Search /> Filter
        </Button>
      </form>

      {matches.length === 0 ? (
        <EmptyState icon={<Search />} title={totalAll ? "No matches for these filters" : "No jobs evaluated yet"}>
          {totalAll ? "Try widening the filters or include excluded jobs to see why listings were filtered." : "Set your preferences in Settings, then click “Search now”. Discovery runs in the background worker."}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {matches.map(({ job, ...m }) => {
            const status = applied.get(job.id);
            const reasons = m.reasons as { included: string[]; excluded: string[] };
            return (
              <Card key={m.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <ScoreBadge score={m.score} eligible={m.eligible} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                        {job.title}
                      </Link>
                      <SourceBadge source={job.sourceKey} isMock={job.isMock} />
                      {m.autoApplyEligible && <span className="text-xs text-success">auto-apply eligible</span>}
                      {status && <span className="text-xs text-primary">application: {status.toLowerCase().replace(/_/g, " ")}</span>}
                    </div>
                    <p className="text-sm">{job.company}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <LocationLine job={job} />
                      <span className="text-muted-foreground">{fmtSalary(job)}</span>
                      <span className="text-muted-foreground">{job.postedAt ? `Posted ${timeAgo(job.postedAt)}` : "Posting date not provided"}</span>
                    </div>
                    {!m.eligible && reasons.excluded[0] && <p className="mt-1 text-xs text-destructive">Excluded: {reasons.excluded[0]}</p>}
                    {m.eligible && m.blockers[0] && <p className="mt-1 text-xs text-warning">Needs attention: {m.blockers[0]}</p>}
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={job.jobUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> Original
                      </a>
                    </Button>
                    {!status && m.eligible && (
                      <ActionButton url={`/api/jobs/${job.id}/apply`} size="sm">
                        Apply
                      </ActionButton>
                    )}
                    <ActionButton url={`/api/jobs/${job.id}/dismiss`} size="icon" variant="ghost" aria-label="Dismiss">
                      <X />
                    </ActionButton>
                  </div>
                </div>
              </Card>
            );
          })}
          <div className="flex justify-between pt-2 text-sm">
            {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="text-primary hover:underline">← Previous</Link> : <span />}
            {page * 30 < total && <Link href={qs({ page: String(page + 1) })} className="text-primary hover:underline">Next →</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
