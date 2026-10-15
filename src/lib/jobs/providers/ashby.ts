import { csv, env } from "@/lib/env";
import { fetchJson } from "../http";
import { buildJob } from "../normalize";
import type { JobProvider, NormalizedJob } from "../types";

export const DEFAULT_ASHBY_BOARDS = ["ramp", "notion", "linear", "openai"];

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  employmentType?: string;
  publishedAt?: string;
  jobUrl: string;
  applyUrl?: string;
  isListed?: boolean;
  descriptionPlain?: string;
  descriptionHtml?: string;
  address?: { postalAddress?: { addressCountry?: string; addressLocality?: string } };
  compensation?: { compensationTierSummary?: string | null; scrapeableCompensationSalarySummary?: string | null };
}

export const ashbyProvider: JobProvider = {
  key: "ashby",
  name: "Ashby job boards",
  coverage: "Employers with public Ashby job boards (configured organisation names). Global, employer-dependent.",
  credentialsRequired: [],
  termsNote: "Public Posting API (read-only). No third-party application submission API — applications are manual.",
  defaultEnabled: true,
  minIntervalMinutes: 60,
  isConfigured: () => true,
  async fetchJobs(_query, config) {
    const boards = config.boards?.length ? config.boards : [...DEFAULT_ASHBY_BOARDS, ...csv(env().ASHBY_BOARDS)];
    const out: NormalizedJob[] = [];
    for (const org of [...new Set(boards)]) {
      try {
        const data = await fetchJson<{ jobs: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`, { provider: "ashby" });
        for (const j of data.jobs) if (j.isListed !== false) out.push(mapAshbyJob(org, j));
      } catch (err) {
        console.warn(`[ashby] board ${org} failed: ${(err as Error).message}`);
      }
    }
    return out;
  },
};

export function mapAshbyJob(org: string, j: AshbyJob): NormalizedJob {
  const comp = j.compensation?.scrapeableCompensationSalarySummary || j.compensation?.compensationTierSummary || null;
  return buildJob({
    sourceKey: "ashby",
    externalId: `${org}:${j.id}`,
    title: j.title,
    company: org.charAt(0).toUpperCase() + org.slice(1),
    descriptionText: j.descriptionPlain,
    descriptionHtml: j.descriptionHtml,
    locationText: j.location ?? null,
    extraLocationTexts: [...(j.secondaryLocations ?? []).map((s) => s.location ?? ""), j.address?.postalAddress?.addressCountry ?? ""].filter(Boolean),
    remoteHint: j.isRemote ?? null,
    arrangementHint: j.workplaceType ?? null,
    employmentTypeRaw: j.employmentType ?? null,
    salary: comp ? { text: comp } : undefined,
    postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
    jobUrl: j.jobUrl,
    applyUrl: j.applyUrl ?? j.jobUrl,
    applicationMethod: "ASHBY",
    atsBoardToken: org,
    atsJobId: j.id,
  });
}
