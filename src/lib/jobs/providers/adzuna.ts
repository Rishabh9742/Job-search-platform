import { env } from "@/lib/env";
import { ADZUNA_COUNTRIES, countryByCode } from "@/lib/taxonomy/countries";
import { fetchJson } from "../http";
import { buildJob } from "../normalize";
import type { JobProvider, NormalizedJob } from "../types";

interface AdzunaJob {
  id: string;
  title: string;
  description: string;
  created: string;
  redirect_url: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
  contract_time?: string;
  contract_type?: string;
  category?: { label?: string };
}

export const adzunaProvider: JobProvider = {
  key: "adzuna",
  name: "Adzuna",
  coverage: `Aggregator for ${ADZUNA_COUNTRIES.length} countries: ${ADZUNA_COUNTRIES.join(", ").toUpperCase()}. Descriptions are truncated snippets.`,
  credentialsRequired: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
  termsNote: "Free developer key (rate-limited, attribution required). Salaries Adzuna marks as 'predicted' are discarded, never shown as real.",
  defaultEnabled: true,
  minIntervalMinutes: 120,
  isConfigured: () => !!(env().ADZUNA_APP_ID && env().ADZUNA_APP_KEY),
  async fetchJobs(query) {
    const { ADZUNA_APP_ID, ADZUNA_APP_KEY } = env();
    const wanted = query.countries.map((c) => c.toLowerCase()).filter((c) => ADZUNA_COUNTRIES.includes(c));
    const countries = wanted.length ? wanted : ["us", "gb", "in"];
    const out: NormalizedJob[] = [];
    for (const cc of countries.slice(0, 8)) {
      for (const term of query.searchTerms.slice(0, 4)) {
        const params = new URLSearchParams({ app_id: ADZUNA_APP_ID!, app_key: ADZUNA_APP_KEY!, results_per_page: "50", what: term, "content-type": "application/json" });
        if (query.maxPostingAgeDays) params.set("max_days_old", String(query.maxPostingAgeDays));
        try {
          const data = await fetchJson<{ results: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/${cc}/search/1?${params}`, { provider: "adzuna" });
          for (const j of data.results) out.push(mapAdzunaJob(cc, j));
        } catch (err) {
          console.warn(`[adzuna] ${cc}/${term} failed: ${(err as Error).message}`);
        }
      }
    }
    return out;
  },
};

export function mapAdzunaJob(cc: string, j: AdzunaJob): NormalizedJob {
  const predicted = String(j.salary_is_predicted ?? "0") === "1";
  const country = countryByCode(cc === "gb" ? "GB" : cc.toUpperCase());
  return buildJob({
    sourceKey: "adzuna",
    externalId: `${cc}:${j.id}`,
    title: j.title.replace(/<[^>]+>/g, ""),
    company: j.company?.display_name || "Unknown employer",
    descriptionHtml: j.description,
    locationText: j.location?.display_name ?? null,
    explicitCountries: country ? [country.code] : [],
    salary: !predicted && j.salary_min ? { min: j.salary_min, max: j.salary_max ?? null, currency: country?.currency ?? null, period: "YEAR" } : undefined,
    employmentTypeRaw: [j.contract_time, j.contract_type].filter(Boolean).join(" "),
    tags: j.category?.label ? [j.category.label] : [],
    postedAt: j.created ? new Date(j.created) : null,
    jobUrl: j.redirect_url,
    applyUrl: j.redirect_url,
    applicationMethod: "EXTERNAL_URL",
    raw: { descriptionTruncated: true },
  });
}
