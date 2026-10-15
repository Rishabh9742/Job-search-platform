import { env } from "@/lib/env";
import { fetchJson } from "../http";
import { buildJob } from "../normalize";
import type { JobProvider, NormalizedJob } from "../types";

interface UsaJobsItem {
  MatchedObjectId: string;
  MatchedObjectDescriptor: {
    PositionID: string;
    PositionTitle: string;
    PositionURI: string;
    ApplyURI?: string[];
    PositionLocationDisplay?: string;
    OrganizationName?: string;
    DepartmentName?: string;
    QualificationSummary?: string;
    PositionSchedule?: { Name: string }[];
    PositionRemuneration?: { MinimumRange: string; MaximumRange: string; RateIntervalCode: string }[];
    PublicationStartDate?: string;
    ApplicationCloseDate?: string;
    UserArea?: { Details?: { JobSummary?: string; WhoMayApply?: { Name?: string }; MajorDuties?: string[]; TeleworkEligible?: boolean; RemoteIndicator?: boolean } };
  };
}

export const usajobsProvider: JobProvider = {
  key: "usajobs",
  name: "USAJOBS",
  coverage: "US federal government vacancies only. Most require US citizenship.",
  credentialsRequired: ["USAJOBS_API_KEY", "USAJOBS_USER_AGENT_EMAIL"],
  termsNote: "Official API; requires a free key tied to your email. Applications are completed on USAJOBS (manual).",
  defaultEnabled: true,
  minIntervalMinutes: 120,
  isConfigured: () => !!(env().USAJOBS_API_KEY && env().USAJOBS_USER_AGENT_EMAIL),
  async fetchJobs(query) {
    if (query.countries.length && !query.countries.includes("US")) return [];
    const out: NormalizedJob[] = [];
    for (const term of query.searchTerms.slice(0, 4)) {
      const params = new URLSearchParams({ Keyword: term, ResultsPerPage: "50" });
      if (query.maxPostingAgeDays) params.set("DatePosted", String(Math.min(60, query.maxPostingAgeDays)));
      const data = await fetchJson<{ SearchResult: { SearchResultItems: UsaJobsItem[] } }>(`https://data.usajobs.gov/api/search?${params}`, {
        provider: "usajobs",
        headers: { Host: "data.usajobs.gov", "User-Agent": env().USAJOBS_USER_AGENT_EMAIL!, "Authorization-Key": env().USAJOBS_API_KEY! },
      });
      for (const item of data.SearchResult.SearchResultItems) out.push(mapUsaJob(item));
    }
    return out;
  },
};

export function mapUsaJob(item: UsaJobsItem): NormalizedJob {
  const d = item.MatchedObjectDescriptor;
  const pay = d.PositionRemuneration?.[0];
  const details = d.UserArea?.Details;
  const description = [details?.JobSummary, ...(details?.MajorDuties ?? []), d.QualificationSummary, details?.WhoMayApply?.Name ? `Who may apply: ${details.WhoMayApply.Name}` : ""].filter(Boolean).join("\n\n");
  return buildJob({
    sourceKey: "usajobs",
    externalId: item.MatchedObjectId,
    title: d.PositionTitle,
    company: [d.OrganizationName, d.DepartmentName].filter(Boolean).join(" — ") || "US Federal Government",
    descriptionText: description,
    locationText: d.PositionLocationDisplay ?? null,
    explicitCountries: ["US"],
    remoteHint: details?.RemoteIndicator ?? null,
    salary: pay ? { min: Number(pay.MinimumRange) || null, max: Number(pay.MaximumRange) || null, currency: "USD", period: pay.RateIntervalCode === "PA" ? "YEAR" : pay.RateIntervalCode === "PH" ? "HOUR" : null } : undefined,
    employmentTypeRaw: d.PositionSchedule?.[0]?.Name ?? null,
    postedAt: d.PublicationStartDate ? new Date(d.PublicationStartDate) : null,
    jobUrl: d.PositionURI,
    applyUrl: d.ApplyURI?.[0] ?? d.PositionURI,
    applicationMethod: "EXTERNAL_URL",
    raw: { closeDate: d.ApplicationCloseDate, whoMayApply: details?.WhoMayApply?.Name },
  });
}
