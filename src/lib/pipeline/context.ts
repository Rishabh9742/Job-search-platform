import type { JobPreferences } from "@prisma/client";
import { db } from "@/lib/db";
import { toCandidateProfile, type CandidateProfile } from "@/lib/profile/schema";
import type { MatchPreferences } from "@/lib/matching/match";
import { CATEGORIES, customRoleCategory } from "@/lib/taxonomy/categories";
import { normalizeCompany } from "@/lib/jobs/normalize";

export async function loadUserContext(userId: string) {
  const [profileRow, prefs, agent] = await Promise.all([
    db.userProfile.findUnique({ where: { userId } }),
    db.jobPreferences.findUnique({ where: { userId } }),
    db.agentState.findUnique({ where: { userId } }),
  ]);
  const profile: CandidateProfile | null = profileRow ? toCandidateProfile(profileRow) : null;
  return { profile, prefs, agent };
}

export function toMatchPreferences(p: JobPreferences): MatchPreferences {
  return {
    categories: p.categories,
    customRoles: p.customRoles,
    keywords: p.keywords,
    excludedKeywords: p.excludedKeywords,
    countries: p.countries,
    includeWorldwideRemote: p.includeWorldwideRemote,
    workArrangements: p.workArrangements,
    employmentTypes: p.employmentTypes,
    experienceLevels: p.experienceLevels,
    salaryMin: p.salaryMin,
    salaryCurrency: p.salaryCurrency,
    minMatchScore: p.minMatchScore,
    excludedCompanies: p.excludedCompanies,
    excludedIndustries: p.excludedIndustries,
    maxPostingAgeDays: p.maxPostingAgeDays,
  };
}

/** Search terms from selected categories + custom roles + keywords. */
export function searchTermsFor(p: JobPreferences): string[] {
  const terms = [
    ...p.categories.flatMap((id) => CATEGORIES.find((c) => c.id === id)?.searchTerms.slice(0, 1) ?? []),
    ...p.customRoles,
    ...p.keywords,
  ];
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

/** Title filter used to keep only plausibly relevant listings from bulk sources. */
export function titleFilterFor(p: JobPreferences): (title: string) => boolean {
  const cats = [...p.categories.map((id) => CATEGORIES.find((c) => c.id === id)).filter(Boolean), ...p.customRoles.map(customRoleCategory)];
  const kws = p.keywords.map((k) => k.toLowerCase());
  if (!cats.length && !kws.length) return () => true;
  return (title) => cats.some((c) => c!.titlePatterns.some((re) => re.test(title))) || kws.some((k) => title.toLowerCase().includes(k));
}

const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Configured daily + per-employer limits. The daily count includes everything
 * already committed today — submitted, submitting, or still in the pipeline —
 * so concurrent matching runs cannot overshoot the limit.
 */
export async function capacity(userId: string, prefs: JobPreferences, company?: string, excludeApplicationId?: string) {
  const today = startOfUtcDay();
  const submittedToday = await db.application.count({
    where: {
      userId,
      ...(excludeApplicationId ? { id: { not: excludeApplicationId } } : {}),
      OR: [
        { submittedAt: { gte: today } },
        { status: "SUBMITTING" },
        { createdAt: { gte: today }, status: { in: ["QUEUED", "PREPARING", "READY_TO_SUBMIT", "RETRY_ELIGIBLE"] } },
      ],
    },
  });
  let perEmployer = 0;
  if (company) {
    perEmployer = await db.application.count({
      where: { userId, status: { notIn: ["CANCELLED"] }, job: { companyNormalized: normalizeCompany(company) } },
    });
  }
  return {
    dailyRemaining: Math.max(0, prefs.maxApplicationsPerDay - submittedToday),
    employerRemaining: company ? Math.max(0, prefs.maxApplicationsPerEmployer - perEmployer) : Infinity,
    nextDayStart: new Date(startOfUtcDay().getTime() + 86400_000),
  };
}
