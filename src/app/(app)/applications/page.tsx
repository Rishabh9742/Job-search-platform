import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Briefcase, Download, Filter } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/taxonomy/categories";
import { COUNTRIES } from "@/lib/taxonomy/countries";
import { fmtDate, STATUS_LABELS } from "@/lib/utils";
import { StatusBadge } from "@/components/application-row";
import { SourceBadge } from "@/components/job-bits";
import { Badge, Button, EmptyState, Input, PageHeader, Select } from "@/components/ui";

type SP = Promise<Record<string, string | undefined>>;

export default async function Tracker({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const where: Prisma.ApplicationWhereInput = {
    userId: user.id,
    ...(sp.status ? { status: sp.status as Prisma.EnumApplicationStatusFilter["equals"] } : {}),
    ...(sp.from || sp.to ? { createdAt: { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(`${sp.to}T23:59:59Z`) } : {}) } } : {}),
    job: {
      ...(sp.company ? { company: { contains: sp.company, mode: "insensitive" } } : {}),
      ...(sp.country ? { countries: { has: sp.country } } : {}),
      ...(sp.category ? { categories: { has: sp.category } } : {}),
    },
  };
  const apps = await db.application.findMany({ where, include: { job: true, confirmation: true }, orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Application Tracker"
        description="Every application with its real submission outcome. Interview/offer updates are recorded by you — no integration reports them automatically."
        actions={
          <Button variant="outline" asChild>
            <a href="/api/applications/export">
              <Download /> Export CSV
            </a>
          </Button>
        }
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7" action="/applications">
        <Input name="company" placeholder="Company" defaultValue={sp.company} aria-label="Company" />
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
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
        <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <Input type="date" name="from" defaultValue={sp.from} aria-label="From date" />
        <Input type="date" name="to" defaultValue={sp.to} aria-label="To date" />
        <Button type="submit" variant="secondary">
          <Filter /> Filter
        </Button>
      </form>

      {apps.length === 0 ? (
        <EmptyState icon={<Briefcase />} title="No applications match">Applications appear here once you apply or the agent prepares one.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Job</th>
                <th className="p-3">Status</th>
                <th className="p-3">Submitted</th>
                <th className="p-3">Evidence</th>
                <th className="p-3">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-t hover:bg-accent/50">
                  <td className="p-3">
                    <Link href={`/applications/${a.id}`} className="font-medium hover:underline">
                      {a.job.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {a.job.company} · <SourceBadge source={a.job.sourceKey} isMock={a.job.isMock} />
                    </div>
                  </td>
                  <td className="p-3">
                    <StatusBadge status={a.status} isTest={a.isTest} />
                  </td>
                  <td className="p-3 text-xs">{a.submittedAt ? fmtDate(a.submittedAt, true) : "—"}</td>
                  <td className="p-3 text-xs">
                    {a.confirmation ? (
                      <>
                        {a.confirmation.method === "USER_REPORTED" ? "Self-reported" : a.confirmation.method === "STATUS_CHECK" ? "Status check" : "API response"}
                        {a.confirmation.confirmationId && <div className="font-mono text-[11px] text-muted-foreground">{a.confirmation.confirmationId}</div>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">{a.outcome !== "NONE" ? <Badge tone={a.outcome === "OFFER" ? "success" : a.outcome === "INTERVIEW" ? "info" : "muted"}>{a.outcome.toLowerCase()}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
