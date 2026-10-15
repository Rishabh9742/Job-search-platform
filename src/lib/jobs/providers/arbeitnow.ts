import { fetchJson } from "../http";
import { buildJob } from "../normalize";
import type { JobProvider, NormalizedJob } from "../types";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

export const arbeitnowProvider: JobProvider = {
  key: "arbeitnow",
  name: "Arbeitnow",
  coverage: "Europe-focused (mostly Germany) on-site and remote roles, including visa-sponsorship listings. Many listings are in German.",
  credentialsRequired: [],
  termsNote: "Free public API; link back to arbeitnow.com. Updated hourly.",
  defaultEnabled: true,
  minIntervalMinutes: 60,
  isConfigured: () => true,
  async fetchJobs() {
    const out: NormalizedJob[] = [];
    for (let page = 1; page <= 3; page++) {
      const data = await fetchJson<{ data: ArbeitnowJob[]; links?: { next?: string | null } }>(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, { provider: "arbeitnow" });
      for (const j of data.data) out.push(mapArbeitnowJob(j));
      if (!data.links?.next) break;
    }
    return out;
  },
};

export function mapArbeitnowJob(j: ArbeitnowJob): NormalizedJob {
  const loc = j.location || "";
  // Arbeitnow is a German board: bare city names without a country are German cities.
  const explicit = loc && !/,/.test(loc) && !/remote/i.test(loc) ? ["DE"] : [];
  return buildJob({
    sourceKey: "arbeitnow",
    externalId: j.slug,
    title: j.title,
    company: j.company_name,
    descriptionHtml: j.description,
    locationText: loc,
    explicitCountries: explicit,
    remoteHint: j.remote,
    employmentTypeRaw: j.job_types?.join(" "),
    tags: j.tags,
    postedAt: j.created_at ? new Date(j.created_at * 1000) : null,
    jobUrl: j.url,
    applyUrl: j.url,
    applicationMethod: "EXTERNAL_URL",
  });
}
