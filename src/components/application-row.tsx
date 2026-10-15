import Link from "next/link";
import { Badge } from "./ui";
import { SourceBadge } from "./job-bits";
import { STATUS_LABELS, STATUS_TONE, timeAgo } from "@/lib/utils";

export function StatusBadge({ status, isTest }: { status: string; isTest?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={STATUS_TONE[status] ?? "muted"}>{STATUS_LABELS[status] ?? status}</Badge>
      {isTest && <Badge tone="info">TEST</Badge>}
    </span>
  );
}

export function ApplicationRow({ a }: { a: { id: string; status: string; isTest: boolean; updatedAt: Date; manualReason: string | null; error: string | null; job: { title: string; company: string; sourceKey: string; isMock: boolean } } }) {
  return (
    <Link href={`/applications/${a.id}`} className="flex flex-col gap-1 rounded-md border p-3 hover:bg-accent sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{a.job.title}</p>
        <p className="truncate text-sm text-muted-foreground">
          {a.job.company} · <SourceBadge source={a.job.sourceKey} isMock={a.job.isMock} />
        </p>
        {(a.manualReason || a.error) && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.manualReason ?? a.error}</p>}
      </div>
      <StatusBadge status={a.status} isTest={a.isTest} />
      <span className="w-20 text-right text-xs text-muted-foreground">{timeAgo(a.updatedAt)}</span>
    </Link>
  );
}
