import { z } from "zod";
import { AiUnavailableError, aiModelName, structured } from "@/lib/ai/client";
import type { CandidateProfile } from "@/lib/profile/schema";
import { checkText, profileCorpus } from "./consistency";
import type { TailoredResume, TailorJob } from "./tailor";

export interface CoverLetterResult {
  text: string;
  generator: string;
  issues: string[];
}

/** Factual template from verified data only. */
export function coverLetterTemplate(p: CandidateProfile, job: TailorJob, resume: TailoredResume): string {
  const name = p.fullName ?? "";
  const latest = p.experience[0];
  const skills = resume.keywordsMatched.slice(0, 4);
  const lines = [
    `Dear ${job.company} Hiring Team,`,
    "",
    `I am applying for the ${job.title} position at ${job.company}.${latest ? ` I currently work${latest.current ? "" : "ed"} as ${latest.title} at ${latest.company}` : ""}${p.yearsExperience ? `, with ${p.yearsExperience} years of professional experience` : ""}${latest ? "." : ""}`,
  ];
  if (skills.length) lines.push("", `The role calls for experience with ${skills.join(", ")}, which I use in my work.`);
  const bullet = resume.experience[0]?.bullets[0];
  if (bullet) lines.push("", `A recent example: ${bullet.replace(/\.$/, "")}.`);
  const proj = resume.projects[0];
  if (proj) lines.push("", `I also built ${proj.name}${proj.technologies.length ? ` using ${proj.technologies.slice(0, 4).join(", ")}` : ""}.`);
  lines.push("", `Thank you for considering my application. I would welcome the opportunity to discuss how I can contribute to ${job.company}.`, "", "Sincerely,", name);
  return lines.join("\n");
}

const SYSTEM = `You write concise, specific cover letters (180-280 words) for a job candidate.
Use ONLY facts from the provided verified candidate profile. Do not invent achievements, metrics, numbers, skills, employers, motivations tied to private facts, or claims about the company beyond what the job description states.
If you mention a number, it must appear verbatim in the profile. Mention only skills present in the profile.
Plain text, no markdown, no placeholders like [Company]. Start with "Dear <Company> Hiring Team," and end with "Sincerely," and the candidate's name.`;

export async function generateCoverLetter(p: CandidateProfile, job: TailorJob, resume: TailoredResume): Promise<CoverLetterResult> {
  const fallback = coverLetterTemplate(p, job, resume);
  try {
    const out = await structured({
      system: SYSTEM,
      user: `<job>\nTitle: ${job.title}\nCompany: ${job.company}\n${job.description.slice(0, 8000)}\n</job>\n<verified_profile>\n${profileCorpus(p)}\n</verified_profile>\n<tailored_summary>${resume.summary}</tailored_summary>`,
      schema: z.object({ letter: z.string() }),
      effort: "medium",
    });
    // Allowed sources: verified profile + the job posting's own text (for company/role names).
    const problems = checkText(out.letter, `${profileCorpus(p)}\n${job.title}\n${job.company}`, p.skills);
    if (problems.length) return { text: fallback, generator: "rule-based (AI draft rejected)", issues: problems };
    if (/\[[A-Z][^\]]*\]/.test(out.letter)) return { text: fallback, generator: "rule-based (AI draft had placeholders)", issues: ["placeholder text"] };
    return { text: out.letter.trim(), generator: aiModelName(), issues: [] };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) console.warn("[cover-letter] AI failed:", (err as Error).message);
    return { text: fallback, generator: "rule-based", issues: [] };
  }
}
