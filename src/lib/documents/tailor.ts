import { z } from "zod";
import { canonicalSkill } from "@/lib/taxonomy/skills";
import { AiUnavailableError, aiModelName, structured } from "@/lib/ai/client";
import { jobSkillSets } from "@/lib/matching/match";
import type { CandidateProfile, Certification, Education, Link } from "@/lib/profile/schema";
import { checkText, profileCorpus, type ConsistencyIssue } from "./consistency";

export interface TailoredExperience {
  title: string;
  company: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  bullets: string[];
}

export interface TailoredResume {
  name: string;
  contact: { email: string | null; phone: string | null; location: string | null; links: Link[] };
  headline: string | null;
  summary: string;
  skills: string[];
  experience: TailoredExperience[];
  projects: { name: string; url: string | null; technologies: string[]; bullets: string[] }[];
  education: Education[];
  certifications: Certification[];
  achievements: string[];
  languages: string[];
  targetJob: { title: string; company: string };
  keywordsMatched: string[];
}

export interface TailorJob {
  title: string;
  company: string;
  description: string;
  tags: string[];
}

export interface TailorResult {
  resume: TailoredResume;
  generator: string;
  issues: ConsistencyIssue[];
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z][a-z+#.]{2,}/g) ?? []);
function overlap(a: string, jdWords: Set<string>) {
  let n = 0;
  for (const w of words(a)) if (jdWords.has(w)) n++;
  return n;
}

/** Deterministic tailoring: reorder and select verified content only — never rewrites facts. */
export function tailorDeterministic(p: CandidateProfile, job: TailorJob): TailoredResume {
  const { required, preferred } = jobSkillSets(job.description, job.tags);
  const jdSkills = new Set([...required, ...preferred].map((s) => s.toLowerCase()));
  const jdWords = words(job.description);
  const skills = [...p.skills].map(canonicalSkill).sort((a, b) => Number(jdSkills.has(b.toLowerCase())) - Number(jdSkills.has(a.toLowerCase())));
  const matched = skills.filter((s) => jdSkills.has(s.toLowerCase()));

  const experience = p.experience.map((e) => ({
    title: e.title,
    company: e.company,
    location: e.location ?? null,
    startDate: e.startDate ?? null,
    endDate: e.endDate ?? null,
    bullets: [...e.bullets].sort((a, b) => overlap(b, jdWords) - overlap(a, jdWords)),
  }));

  const projects = [...p.projects]
    .map((x) => ({ x, s: x.technologies.filter((t) => jdSkills.has(canonicalSkill(t).toLowerCase())).length * 3 + overlap(`${x.description ?? ""} ${x.bullets.join(" ")}`, jdWords) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(({ x }) => ({ name: x.name, url: x.url ?? null, technologies: x.technologies, bullets: x.bullets.length ? x.bullets : x.description ? [x.description] : [] }));

  const latest = p.experience[0];
  const role = p.headline || latest?.title || "Professional";
  const yrs = p.yearsExperience != null && p.yearsExperience >= 1 ? ` with ${p.yearsExperience} years of experience` : "";
  const top = matched.slice(0, 5);
  const summary = p.summary && !top.length
    ? p.summary
    : `${role}${yrs}${top.length ? ` working with ${top.join(", ")}` : ""}.${latest ? ` Most recently ${latest.title} at ${latest.company}.` : ""}${p.summary ? ` ${p.summary}` : ""}`;

  return {
    name: p.fullName ?? "",
    contact: { email: p.email, phone: p.phone, location: p.location, links: p.links },
    headline: p.headline,
    summary: summary.trim(),
    skills,
    experience,
    projects,
    education: p.education,
    certifications: p.certifications,
    achievements: p.achievements,
    languages: p.languages,
    targetJob: { title: job.title, company: job.company },
    keywordsMatched: matched,
  };
}

const AiTailorSchema = z.object({
  summary: z.string(),
  skillOrder: z.array(z.string()),
  experience: z.array(z.object({ index: z.number().int(), bullets: z.array(z.object({ sourceBulletIndex: z.number().int(), text: z.string() })) })),
  projectIndexes: z.array(z.number().int()),
});

const SYSTEM = `You tailor a candidate's VERIFIED resume to a specific job. You may only rephrase and reorder — never add facts.
Hard rules:
- Do not invent skills, tools, employers, titles, dates, degrees, certifications, projects, metrics, numbers, team sizes, or outcomes.
- Every rewritten bullet must be a faithful rewording of exactly one source bullet (give its sourceBulletIndex). Keep every number exactly as in the source; add no new numbers.
- Only mention a skill if it appears in the candidate's skills list or in that source bullet.
- Use the job's terminology only where it truthfully describes the candidate's existing work. No keyword stuffing.
- summary: 2-3 sentences, first person implied (no "I"), built only from the profile facts.
- skillOrder: the candidate's own skills, most relevant to this job first. Do not add skills.
- projectIndexes: up to 3 most relevant project indexes.`;

/** AI tailoring with a post-hoc factual-consistency gate; any violating text is reverted to verified source. */
export async function tailorResume(p: CandidateProfile, job: TailorJob): Promise<TailorResult> {
  const base = tailorDeterministic(p, job);
  let ai: z.infer<typeof AiTailorSchema>;
  try {
    ai = await structured({
      system: SYSTEM,
      user: `<job>\nTitle: ${job.title}\nCompany: ${job.company}\n${job.description.slice(0, 12000)}\n</job>\n<candidate_profile>\n${JSON.stringify({
        headline: p.headline,
        summary: p.summary,
        yearsExperience: p.yearsExperience,
        skills: p.skills,
        experience: p.experience.map((e, index) => ({ index, title: e.title, company: e.company, bullets: e.bullets.map((b, i) => ({ i, text: b })) })),
        projects: p.projects.map((x, index) => ({ index, name: x.name, technologies: x.technologies, description: x.description, bullets: x.bullets })),
        certifications: p.certifications.map((c) => c.name),
      })}\n</candidate_profile>`,
      schema: AiTailorSchema,
      effort: "medium",
    });
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) console.warn("[tailor] AI failed, using deterministic tailoring:", (err as Error).message);
    return { resume: base, generator: "rule-based", issues: [] };
  }
  return applyAiTailoring(p, base, ai);
}

export function applyAiTailoring(p: CandidateProfile, base: TailoredResume, ai: z.infer<typeof AiTailorSchema>): TailorResult {
  const issues: ConsistencyIssue[] = [];
  const corpus = profileCorpus(p);

  // Summary: must pass the consistency check against the whole verified profile.
  let summary = ai.summary.trim();
  const sProblems = checkText(summary, corpus, p.skills);
  if (sProblems.length || !summary) {
    issues.push({ location: "summary", problem: sProblems.join("; ") || "empty", action: "reverted" });
    summary = base.summary;
  }

  // Skills: subset of the profile only; keep any the AI dropped at the end.
  const own = new Map(p.skills.map((s) => [canonicalSkill(s).toLowerCase(), canonicalSkill(s)]));
  const ordered: string[] = [];
  for (const s of ai.skillOrder) {
    const c = own.get(canonicalSkill(s).toLowerCase());
    if (c && !ordered.includes(c)) ordered.push(c);
    else if (!c) issues.push({ location: "skills", problem: `"${s}" is not in profile`, action: "removed" });
  }
  for (const s of own.values()) if (!ordered.includes(s)) ordered.push(s);

  // Experience: titles/companies/dates always copied from the profile; bullets checked one by one.
  const experience = p.experience.map((e, idx) => {
    const aiExp = ai.experience.find((x) => x.index === idx);
    const used = new Set<number>();
    const bullets: string[] = [];
    for (const b of aiExp?.bullets ?? []) {
      const src = e.bullets[b.sourceBulletIndex];
      if (src == null || used.has(b.sourceBulletIndex)) continue;
      used.add(b.sourceBulletIndex);
      const problems = checkText(b.text, `${src}\n${p.skills.join(", ")}`, p.skills);
      if (problems.length) {
        issues.push({ location: `experience.${idx}.bullets.${b.sourceBulletIndex}`, problem: problems.join("; "), action: "reverted" });
        bullets.push(src);
      } else bullets.push(b.text.trim());
    }
    e.bullets.forEach((src, i) => {
      if (!used.has(i)) bullets.push(src);
    });
    return { title: e.title, company: e.company, location: e.location ?? null, startDate: e.startDate ?? null, endDate: e.endDate ?? null, bullets };
  });

  const projIdx = ai.projectIndexes.filter((i) => p.projects[i]).slice(0, 3);
  const projects = projIdx.length
    ? projIdx.map((i) => {
        const x = p.projects[i];
        return { name: x.name, url: x.url ?? null, technologies: x.technologies, bullets: x.bullets.length ? x.bullets : x.description ? [x.description] : [] };
      })
    : base.projects;

  return {
    resume: { ...base, summary, skills: ordered, experience, projects },
    generator: aiModelName(),
    issues,
  };
}
