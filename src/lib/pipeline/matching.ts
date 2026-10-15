import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { matchJob } from "@/lib/matching/match";
import { capacity, loadUserContext, toMatchPreferences, titleFilterFor } from "./context";

export const applicationKeyFor = (userId: string, dedupeKey: string) => sha256(`${userId}|${dedupeKey}`);

export interface MatchingReport {
  evaluated: number;
  eligible: number;
  autoEligible: number;
  applicationsCreated: string[];
}

/**
 * Score every active, non-duplicate listing relevant to the user. When
 * `createApplications` is set (agent running + auto-apply enabled), create
 * applications for auto-eligible matches within the configured limits.
 */
export async function runMatching(userId: string, createApplications: boolean): Promise<MatchingReport> {
  const { profile, prefs } = await loadUserContext(userId);
  if (!profile || !prefs) throw new Error("Profile and preferences are required before matching.");
  const mp = toMatchPreferences(prefs);
  const relevant = titleFilterFor(prefs);
  const since = new Date(Date.now() - 45 * 86400_000);
  const jobs = await db.job.findMany({ where: { status: { not: "CLOSED" }, duplicateOfId: null, lastSeenAt: { gte: since } }, orderBy: { lastSeenAt: "desc" }, take: 5000 });
  const report: MatchingReport = { evaluated: 0, eligible: 0, autoEligible: 0, applicationsCreated: [] };
  const autoCandidates: { jobId: string; score: number; dedupeKey: string; company: string }[] = [];

  for (const job of jobs) {
    if (!relevant(job.title)) continue;
    report.evaluated++;
    const r = matchJob(job, profile, mp);
    if (r.eligible) report.eligible++;
    if (r.autoApplyEligible) {
      report.autoEligible++;
      autoCandidates.push({ jobId: job.id, score: r.score, dedupeKey: job.dedupeKey, company: job.company });
    }
    const data = {
      score: r.score,
      eligible: r.eligible,
      autoApplyEligible: r.autoApplyEligible,
      matchedCategory: r.matchedCategory,
      matchedSkills: r.matchedSkills,
      missingSkills: r.missingSkills,
      breakdown: r.breakdown as unknown as Prisma.InputJsonValue,
      reasons: r.reasons as unknown as Prisma.InputJsonValue,
      blockers: r.blockers,
    };
    await db.jobMatch.upsert({ where: { userId_jobId: { userId, jobId: job.id } }, create: { userId, jobId: job.id, ...data }, update: data });
  }

  if (createApplications && prefs.autoApplyEnabled) {
    autoCandidates.sort((a, b) => b.score - a.score);
    // Serialize application creation per user so concurrent matching runs cannot exceed limits.
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`apply-capacity:${userId}`}))`;
        let { dailyRemaining } = await capacity(userId, prefs);
        const createdPerEmployer = new Map<string, number>();
        for (const c of autoCandidates) {
          if (dailyRemaining <= 0) break;
          const key = applicationKeyFor(userId, c.dedupeKey);
          const exists = await db.application.findFirst({ where: { OR: [{ applicationKey: key }, { userId, jobId: c.jobId }] }, select: { id: true } });
          if (exists) continue;
          const dismissed = await db.jobMatch.findUnique({ where: { userId_jobId: { userId, jobId: c.jobId } }, select: { dismissed: true } });
          if (dismissed?.dismissed) continue;
          const { employerRemaining } = await capacity(userId, prefs, c.company);
          const thisRun = createdPerEmployer.get(c.company) ?? 0;
          if (employerRemaining - thisRun <= 0) continue;
          try {
            const app = await tx.application.create({ data: { userId, jobId: c.jobId, applicationKey: key, status: "QUEUED", isTest: prefs.submissionMode === "SANDBOX" } });
            report.applicationsCreated.push(app.id);
            createdPerEmployer.set(c.company, thisRun + 1);
            dailyRemaining--;
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // concurrent duplicate
            throw err;
          }
        }
      },
      { timeout: 60_000 },
    );
  }
  return report;
}
