import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PROVIDERS, syncJobSources } from "@/lib/jobs/registry";
import { canonicalizeUrl, dedupeBatch, dedupeKey, normalizeCompany } from "@/lib/jobs/normalize";
import { categoriesForTitle } from "@/lib/taxonomy/categories";
import { RateLimitError } from "@/lib/jobs/http";
import type { NormalizedJob, ProviderConfig } from "@/lib/jobs/types";
import { searchTermsFor, titleFilterFor } from "./context";

export interface DiscoveryReport {
  providers: { key: string; status: "fetched" | "cached" | "skipped" | "error" | "rate_limited"; fetched: number; kept: number; message?: string }[];
  upserted: number;
  duplicatesMerged: number;
}

/**
 * Fetch from every enabled, configured provider (respecting each provider's
 * minimum interval), keep listings relevant to the user's preferences,
 * normalize, dedupe within the batch and against existing rows, and upsert.
 */
export async function runDiscovery(userId: string, onProgress?: (pct: number, msg: string) => Promise<void>): Promise<DiscoveryReport> {
  const prefs = await db.jobPreferences.findUnique({ where: { userId } });
  if (!prefs) throw new Error("Set your job preferences before searching.");
  await syncJobSources();
  const sources = await db.jobSource.findMany();
  const query = { searchTerms: searchTermsFor(prefs), countries: prefs.countries, includeRemote: prefs.includeWorldwideRemote || prefs.workArrangements.includes("REMOTE"), maxPostingAgeDays: prefs.maxPostingAgeDays };
  const relevant = titleFilterFor(prefs);
  const report: DiscoveryReport = { providers: [], upserted: 0, duplicatesMerged: 0 };
  const collected: NormalizedJob[] = [];

  const active = PROVIDERS.filter((p) => sources.find((s) => s.key === p.key)?.enabled && p.isConfigured());
  for (const [i, provider] of active.entries()) {
    const src = sources.find((s) => s.key === provider.key)!;
    await onProgress?.(Math.round((i / Math.max(active.length, 1)) * 70), `Searching ${provider.name}`);
    const fresh = src.lastFetchedAt && Date.now() - src.lastFetchedAt.getTime() < src.minIntervalMinutes * 60_000;
    // Bulk board sources are global; within the interval rely on stored rows instead of refetching.
    const queryDependent = ["remotive", "adzuna", "usajobs"].includes(provider.key);
    if (fresh && !queryDependent) {
      report.providers.push({ key: provider.key, status: "cached", fetched: 0, kept: 0, message: `Fetched ${Math.round((Date.now() - src.lastFetchedAt!.getTime()) / 60000)} min ago; respecting ${src.minIntervalMinutes} min interval` });
      continue;
    }
    if (fresh && provider.key === "remotive") {
      report.providers.push({ key: provider.key, status: "skipped", fetched: 0, kept: 0, message: "Remotive allows ~4 fetches/day" });
      continue;
    }
    try {
      const jobs = await provider.fetchJobs(query, (src.config ?? {}) as ProviderConfig);
      const kept = jobs.filter((j) => j.title && j.jobUrl && relevant(j.title));
      collected.push(...kept);
      await db.jobSource.update({ where: { key: provider.key }, data: { lastFetchedAt: new Date(), lastStatus: "ok", lastError: null, lastJobCount: jobs.length } });
      report.providers.push({ key: provider.key, status: "fetched", fetched: jobs.length, kept: kept.length });
    } catch (err) {
      const rate = err instanceof RateLimitError;
      await db.jobSource.update({ where: { key: provider.key }, data: { lastStatus: rate ? "rate_limited" : "error", lastError: (err as Error).message.slice(0, 500) } });
      report.providers.push({ key: provider.key, status: rate ? "rate_limited" : "error", fetched: 0, kept: 0, message: (err as Error).message });
    }
  }

  await onProgress?.(75, "Normalizing and de-duplicating");
  const batch = dedupeBatch(collected);
  report.duplicatesMerged = collected.length - batch.length;
  report.upserted = await upsertJobs(batch);
  await onProgress?.(100, `Stored ${report.upserted} listings`);
  return report;
}

export async function upsertJobs(jobs: NormalizedJob[]): Promise<number> {
  let n = 0;
  for (const j of jobs) {
    const key = dedupeKey(j);
    const canonicalUrl = canonicalizeUrl(j.jobUrl);
    // Cross-source duplicate: an existing row from another source with the same identity.
    const dup = await db.job.findFirst({
      where: { OR: [{ dedupeKey: key }, { canonicalUrl }], NOT: { sourceKey: j.sourceKey, externalId: j.externalId }, duplicateOfId: null },
      select: { id: true },
    });
    const data = {
      dedupeKey: key,
      canonicalUrl,
      title: j.title,
      company: j.company,
      companyNormalized: normalizeCompany(j.company),
      description: j.description,
      locationText: j.locationText,
      countries: j.countries,
      remoteRegions: j.remoteRegions,
      isRemote: j.isRemote,
      workArrangement: j.workArrangement,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      salaryCurrency: j.salaryCurrency,
      salaryPeriod: j.salaryPeriod,
      salaryText: j.salaryText,
      employmentType: j.employmentType,
      experienceLevel: j.experienceLevel,
      categories: categoriesForTitle(j.title),
      tags: j.tags,
      postedAt: j.postedAt,
      jobUrl: j.jobUrl,
      applyUrl: j.applyUrl,
      applicationMethod: j.applicationMethod,
      atsBoardToken: j.atsBoardToken,
      atsJobId: j.atsJobId,
      isMock: j.isMock,
      raw: (j.raw ?? undefined) as Prisma.InputJsonValue | undefined,
      lastSeenAt: new Date(),
    };
    await db.job.upsert({
      where: { sourceKey_externalId: { sourceKey: j.sourceKey, externalId: j.externalId } },
      create: { sourceKey: j.sourceKey, externalId: j.externalId, ...data, duplicateOfId: dup?.id ?? null, status: "ACTIVE" },
      update: { ...data, status: "ACTIVE" },
    });
    n++;
  }
  return n;
}
