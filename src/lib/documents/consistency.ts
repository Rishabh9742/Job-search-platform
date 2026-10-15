import { extractSkills, canonicalSkill } from "@/lib/taxonomy/skills";
import type { CandidateProfile } from "@/lib/profile/schema";

/** Every numeric token in a string (e.g. "40%", "3", "1.5M" → "40", "3", "1.5"). */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
}

/** All source text from the verified profile — the only allowed origin of facts. */
export function profileCorpus(p: CandidateProfile): string {
  return [
    p.fullName, p.headline, p.summary, p.location,
    p.skills.join(", "),
    ...p.experience.flatMap((e) => [e.title, e.company, e.location, e.startDate, e.endDate, ...e.bullets]),
    ...p.education.flatMap((e) => [e.institution, e.degree, e.field, e.startDate, e.endDate, e.grade]),
    ...p.projects.flatMap((x) => [x.name, x.description, x.technologies.join(", "), ...x.bullets]),
    ...p.certifications.flatMap((c) => [c.name, c.issuer, c.date]),
    ...p.achievements,
    p.languages.join(", "),
    p.yearsExperience != null ? `${p.yearsExperience} years` : "",
  ].filter(Boolean).join("\n");
}

export interface ConsistencyIssue {
  location: string;
  problem: string;
  action: "reverted" | "removed" | "flagged";
}

/**
 * Check generated text against allowed facts:
 *  - every skill it names must be in the profile's skills or the allowed source text
 *  - every number it contains must appear in the allowed source text
 * Returns the list of violations (empty = consistent).
 */
export function checkText(generated: string, allowedSource: string, profileSkills: string[]): string[] {
  const problems: string[] = [];
  const allowedSkills = new Set([...profileSkills.map((s) => canonicalSkill(s).toLowerCase()), ...extractSkills(allowedSource).map((s) => s.toLowerCase())]);
  for (const s of extractSkills(generated)) if (!allowedSkills.has(s.toLowerCase())) problems.push(`mentions skill "${s}" not in profile`);
  const allowedNums = new Set(numbersIn(allowedSource));
  for (const n of numbersIn(generated)) if (!allowedNums.has(n)) problems.push(`contains number "${n}" not present in profile`);
  return problems;
}
