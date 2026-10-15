import { z } from "zod";
import { AiUnavailableError, structured } from "@/lib/ai/client";
import type { CandidateProfile } from "@/lib/profile/schema";
import { checkText, profileCorpus } from "./consistency";
import type { TailorJob, TailoredResume } from "./tailor";

export type OpenAnswers = Partial<Record<"about" | "whyRole" | "whyCompany", string>>;

function templates(p: CandidateProfile, job: TailorJob, resume: TailoredResume): OpenAnswers {
  const latest = p.experience[0];
  const skills = resume.keywordsMatched.slice(0, 3);
  return {
    about: resume.summary,
    whyRole: `The ${job.title} role aligns with my experience${skills.length ? ` in ${skills.join(", ")}` : ""}${latest ? ` as ${latest.title} at ${latest.company}` : ""}.`,
    whyCompany: `I am interested in contributing to ${job.company} in the ${job.title} role, applying my background${skills.length ? ` in ${skills.join(", ")}` : ""}.`,
  };
}

/**
 * Short answers to common open-ended questions, built only from verified
 * profile facts. AI drafts are fact-checked; failures fall back to templates.
 */
export async function generateOpenAnswers(p: CandidateProfile, job: TailorJob, resume: TailoredResume): Promise<{ answers: OpenAnswers; issues: string[] }> {
  const base = templates(p, job, resume);
  try {
    const out = await structured({
      system:
        "Write brief (60-120 words each), truthful answers to common job-application questions using ONLY the verified candidate profile and the job text. Do not invent facts, numbers, motivations about private life, or company facts not in the job text. Plain text.",
      user: `<job>\n${job.title} at ${job.company}\n${job.description.slice(0, 6000)}\n</job>\n<verified_profile>\n${profileCorpus(p)}\n</verified_profile>`,
      schema: z.object({ about: z.string(), whyRole: z.string(), whyCompany: z.string() }),
      effort: "low",
    });
    const allowed = `${profileCorpus(p)}\n${job.title}\n${job.company}`;
    const issues: string[] = [];
    const answers: OpenAnswers = {};
    for (const k of ["about", "whyRole", "whyCompany"] as const) {
      const problems = checkText(out[k], allowed, p.skills);
      if (problems.length) {
        issues.push(`${k}: ${problems.join("; ")}`);
        answers[k] = base[k];
      } else answers[k] = out[k].trim();
    }
    return { answers, issues };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) console.warn("[answers] AI failed:", (err as Error).message);
    return { answers: base, issues: [] };
  }
}
