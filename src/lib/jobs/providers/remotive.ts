import { fetchJson } from "../http";
import { buildJob } from "../normalize";
import type { JobProvider, NormalizedJob } from "../types";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export const remotiveProvider: JobProvider = {
  key: "remotive",
  name: "Remotive",
  coverage: "Remote-only roles; eligibility by candidate_required_location (worldwide or region/country restricted). Listings delayed 24h.",
  credentialsRequired: [],
  termsNote:
    "Free API: must link back to Remotive and credit it as the source; max ~4 fetches/day; their terms prohibit showing listings to collect sign-ups. Disabled by default — enable only for personal use.",
  defaultEnabled: false,
  minIntervalMinutes: 360,
  isConfigured: () => true,
  async fetchJobs(query) {
    const terms = query.searchTerms.slice(0, 4);
    const out: NormalizedJob[] = [];
    for (const term of terms.length ? terms : [""]) {
      const url = `https://remotive.com/api/remote-jobs?limit=100${term ? `&search=${encodeURIComponent(term)}` : ""}`;
      const data = await fetchJson<{ jobs: RemotiveJob[] }>(url, { provider: "remotive" });
      for (const j of data.jobs) out.push(mapRemotiveJob(j));
    }
    return out;
  },
};

export function mapRemotiveJob(j: RemotiveJob): NormalizedJob {
  const loc = j.candidate_required_location || "";
  return buildJob({
    sourceKey: "remotive",
    externalId: String(j.id),
    title: j.title,
    company: j.company_name,
    descriptionHtml: j.description,
    locationText: loc ? `Remote (${loc})` : "Remote",
    remoteHint: true,
    arrangementHint: "remote",
    salary: j.salary ? { text: j.salary } : undefined,
    employmentTypeRaw: j.job_type ?? null,
    tags: [...(j.tags ?? []), ...(j.category ? [j.category] : [])],
    postedAt: j.publication_date ? new Date(j.publication_date + (j.publication_date.endsWith("Z") ? "" : "Z")) : null,
    jobUrl: j.url,
    applyUrl: j.url,
    applicationMethod: "EXTERNAL_URL",
  });
}
