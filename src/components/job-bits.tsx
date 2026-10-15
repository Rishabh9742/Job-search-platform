import { MapPin } from "lucide-react";
import { Badge } from "./ui";
import { countryName } from "@/lib/taxonomy/countries";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  adzuna: "Adzuna",
  usajobs: "USAJOBS",
  mock: "MOCK",
};

export function SourceBadge({ source, isMock }: { source: string; isMock?: boolean }) {
  return <Badge tone={isMock ? "warning" : "muted"}>via {SOURCE_LABEL[source] ?? source}</Badge>;
}

export function ScoreBadge({ score, eligible }: { score: number; eligible?: boolean }) {
  const tone = !eligible ? "muted" : score >= 75 ? "success" : score >= 55 ? "default" : "warning";
  return (
    <Badge tone={tone} className={cn("tabular-nums", "text-sm")} title="Explainable relevance score — not a prediction of hiring success">
      {score}
    </Badge>
  );
}

export function LocationLine({ job }: { job: { locationText: string | null; countries: string[]; isRemote: boolean; workArrangement: string; remoteRegions: string[] } }) {
  const arrangement = job.workArrangement === "UNKNOWN" ? null : job.workArrangement.charAt(0) + job.workArrangement.slice(1).toLowerCase();
  const where = job.locationText || (job.countries.length ? job.countries.map(countryName).join(", ") : "Location not provided");
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <MapPin className="size-3.5" />
      {arrangement && <span className="font-medium text-foreground/80">{arrangement}</span>}
      {arrangement && " · "}
      <span className="truncate">{where}</span>
    </span>
  );
}
