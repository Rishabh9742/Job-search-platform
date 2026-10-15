import { BarChart3 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { countryName } from "@/lib/taxonomy/countries";
import { STATUS_LABELS } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, Stat } from "@/components/ui";

/** Single-series vertical bars: one hue, thin marks, 4px rounded tops, per-bar hover tooltip. */
function DailyBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <div className="flex h-40 items-end gap-[2px] border-b border-border" role="img" aria-label="Applications created per day, last 14 days">
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end justify-center">
            <div className="w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }} />
            <span className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded border bg-card px-1.5 py-0.5 text-[11px] shadow-sm group-hover:block">
              {d.label}: <b className="tabular-nums">{d.value}</b>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </figure>
  );
}

/** Horizontal magnitude bars (one hue), labelled in text ink with the value. */
function HBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="group grid grid-cols-[minmax(0,140px)_1fr_40px] items-center gap-2 text-sm" title={`${r.label}: ${r.value}`}>
          <span className="truncate text-muted-foreground">{r.label}</span>
          <div className="h-3 rounded-r-[4px] bg-muted">
            <div className="h-full rounded-r-[4px] bg-primary group-hover:opacity-80" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export default async function Analytics() {
  const user = await requireUser();
  const since = new Date(Date.now() - 13 * 86400_000);
  since.setUTCHours(0, 0, 0, 0);
  const [apps, matches] = await Promise.all([
    db.application.findMany({ where: { userId: user.id }, select: { createdAt: true, status: true, outcome: true, isTest: true, job: { select: { sourceKey: true, countries: true, isRemote: true } } } }),
    db.jobMatch.findMany({ where: { userId: user.id }, select: { score: true, eligible: true, job: { select: { sourceKey: true } } } }),
  ]);
  if (!apps.length && !matches.length) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Analytics" />
        <EmptyState icon={<BarChart3 />} title="No data yet">Run a search to see discovery and application analytics.</EmptyState>
      </div>
    );
  }
  const days = Array.from({ length: 14 }, (_, i) => new Date(since.getTime() + i * 86400_000));
  const daily = days.map((d) => ({ label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: apps.filter((a) => a.createdAt >= d && a.createdAt.getTime() < d.getTime() + 86400_000).length }));
  const count = <T,>(xs: T[], key: (x: T) => string | string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) for (const k of ([] as string[]).concat(key(x))) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const live = apps.filter((a) => !a.isTest);
  const submitted = live.filter((a) => a.status === "SUBMITTED_CONFIRMED").length;
  const interviews = live.filter((a) => a.outcome === "INTERVIEW" || a.outcome === "OFFER").length;
  const avgScore = matches.length ? Math.round(matches.reduce((a, m) => a + m.score, 0) / matches.length) : 0;
  const scoreBuckets = [0, 20, 40, 60, 80].map((lo) => ({ label: `${lo}–${lo + 19 + (lo === 80 ? 1 : 0)}`, value: matches.filter((m) => m.score >= lo && (lo === 80 ? m.score <= 100 : m.score < lo + 20)).length }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Analytics" description="Live (non-test) submissions are counted separately from sandbox tests." />
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Jobs evaluated" value={matches.length} />
        <Stat label="Eligible" value={matches.filter((m) => m.eligible).length} />
        <Stat label="Live confirmed submissions" value={submitted} tone="success" hint={`${apps.length - live.length} sandbox test(s) excluded`} />
        <Stat label="Interview rate" value={submitted ? `${Math.round((interviews / submitted) * 100)}%` : "—"} hint="from outcomes you recorded" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Applications created per day</CardTitle>
          <CardDescription>Last 14 days, all statuses.</CardDescription>
        </CardHeader>
        <CardContent>
          <DailyBars data={daily} />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground">Table view</summary>
            <table className="mt-2 w-full text-xs">
              <tbody>
                {daily.map((d) => (
                  <tr key={d.label} className="border-t">
                    <td className="py-1">{d.label}</td>
                    <td className="py-1 text-right tabular-nums">{d.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Applications by status</CardTitle>
          </CardHeader>
          <CardContent>
            <HBars rows={count(apps, (a) => STATUS_LABELS[a.status])} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Match score distribution</CardTitle>
            <CardDescription>Average {avgScore}. Relevance only — not a hiring prediction.</CardDescription>
          </CardHeader>
          <CardContent>
            <HBars rows={scoreBuckets} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Evaluated jobs by source</CardTitle>
          </CardHeader>
          <CardContent>
            <HBars rows={count(matches, (m) => m.job.sourceKey)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Applications by country</CardTitle>
          </CardHeader>
          <CardContent>
            <HBars rows={count(apps, (a) => (a.job.isRemote && !a.job.countries.length ? "Remote" : a.job.countries.length ? a.job.countries.map(countryName) : "Unknown")).slice(0, 10)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
