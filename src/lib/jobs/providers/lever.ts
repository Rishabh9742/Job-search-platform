import { csv, env } from "@/lib/env";
import { fetchJson, fetchWithRetry } from "../http";
import { buildJob } from "../normalize";
import type { JobProvider, NormalizedJob } from "../types";

export const DEFAULT_LEVER_SITES = ["spotify", "palantir"];

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt?: number;
  country?: string;
  workplaceType?: string;
  categories?: { commitment?: string; department?: string; location?: string; team?: string; allLocations?: string[] };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

export const LEVER_API = "https://api.lever.co/v0/postings";

export const leverProvider: JobProvider = {
  key: "lever",
  name: "Lever job sites",
  coverage: "Employers with public Lever postings (configured site names). Global, employer-dependent.",
  credentialsRequired: [],
  termsNote: "Public Postings API (read-only). Application submission requires an employer-issued Postings API key.",
  defaultEnabled: true,
  minIntervalMinutes: 60,
  isConfigured: () => true,
  async fetchJobs(_query, config) {
    const sites = config.boards?.length ? config.boards : [...DEFAULT_LEVER_SITES, ...csv(env().LEVER_SITES)];
    const out: NormalizedJob[] = [];
    for (const site of [...new Set(sites)]) {
      try {
        const postings = await fetchJson<LeverPosting[]>(`${LEVER_API}/${encodeURIComponent(site)}?mode=json`, { provider: "lever" });
        for (const p of postings) out.push(mapLeverPosting(site, p));
      } catch (err) {
        console.warn(`[lever] site ${site} failed: ${(err as Error).message}`);
      }
    }
    return out;
  },
  async checkAvailability(job) {
    if (!job.atsBoardToken || !job.atsJobId) return "UNKNOWN";
    const res = await fetchWithRetry(`${LEVER_API}/${encodeURIComponent(job.atsBoardToken)}/${encodeURIComponent(job.atsJobId)}`, { provider: "lever" });
    if (res.status === 404) return "CLOSED";
    return res.ok ? "ACTIVE" : "UNKNOWN";
  },
};

export function mapLeverPosting(site: string, p: LeverPosting): NormalizedJob {
  const lists = (p.lists ?? []).map((l) => `${l.text}\n${l.content.replace(/<[^>]+>/g, "\n")}`).join("\n\n");
  const description = [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n\n");
  const interval = p.salaryRange?.interval;
  return buildJob({
    sourceKey: "lever",
    externalId: `${site}:${p.id}`,
    title: p.text,
    company: site.charAt(0).toUpperCase() + site.slice(1),
    descriptionHtml: description,
    locationText: p.categories?.location ?? null,
    extraLocationTexts: p.categories?.allLocations ?? [],
    explicitCountries: p.country ? [p.country] : [],
    arrangementHint: p.workplaceType && p.workplaceType !== "unspecified" ? p.workplaceType : null,
    employmentTypeRaw: p.categories?.commitment ?? null,
    salary: p.salaryRange?.min
      ? { min: p.salaryRange.min, max: p.salaryRange.max ?? null, currency: p.salaryRange.currency ?? null, period: interval?.includes("year") ? "YEAR" : interval?.includes("hour") ? "HOUR" : interval?.includes("month") ? "MONTH" : null }
      : undefined,
    tags: [p.categories?.department, p.categories?.team].filter(Boolean) as string[],
    postedAt: p.createdAt ? new Date(p.createdAt) : null,
    jobUrl: p.hostedUrl,
    applyUrl: p.applyUrl,
    applicationMethod: "LEVER",
    atsBoardToken: site,
    atsJobId: p.id,
  });
}
