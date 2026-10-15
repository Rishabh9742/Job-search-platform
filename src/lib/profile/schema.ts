import { z } from "zod";

export const ExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  current: z.boolean().optional(),
  bullets: z.array(z.string()),
});

export const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string().nullable().optional(),
  field: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  grade: z.string().nullable().optional(),
});

export const ProjectSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  technologies: z.array(z.string()),
  url: z.string().nullable().optional(),
  bullets: z.array(z.string()),
});

export const CertificationSchema = z.object({
  name: z.string(),
  issuer: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

export const LinkSchema = z.object({ label: z.string(), url: z.string() });

export const ParsedResumeSchema = z.object({
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  links: z.array(LinkSchema),
  skills: z.array(z.string()),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  projects: z.array(ProjectSchema),
  certifications: z.array(CertificationSchema),
  achievements: z.array(z.string()),
  languages: z.array(z.string()),
  /** Dotted paths (e.g. "experience.0.startDate") the extractor was not confident about. */
  uncertainFields: z.array(z.string()),
});

export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

export const WorkAuthorizationSchema = z.object({
  countryCode: z.string().length(2),
  authorized: z.boolean(),
  requiresSponsorship: z.boolean(),
});
export type WorkAuthorization = z.infer<typeof WorkAuthorizationSchema>;

export const AnswerBankEntrySchema = z.object({ key: z.string(), question: z.string(), answer: z.string() });
export type AnswerBankEntry = z.infer<typeof AnswerBankEntrySchema>;

/** Profile as edited/verified by the user. */
export const ProfileUpdateSchema = ParsedResumeSchema.omit({ uncertainFields: true }).extend({
  countryCode: z.string().length(2).nullable(),
  yearsExperience: z.number().min(0).max(60).nullable(),
  workAuthorizations: z.array(WorkAuthorizationSchema),
  salaryExpectation: z.string().nullable(),
  availability: z.string().nullable(),
  answerBank: z.array(AnswerBankEntrySchema),
  uncertainFields: z.array(z.string()).default([]),
  markVerified: z.boolean().default(false),
});
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

/** Candidate profile shape used by matching / document generation. */
export interface CandidateProfile {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  countryCode: string | null;
  headline: string | null;
  summary: string | null;
  links: Link[];
  skills: string[];
  experience: Experience[];
  education: Education[];
  projects: Project[];
  certifications: Certification[];
  achievements: string[];
  languages: string[];
  yearsExperience: number | null;
  workAuthorizations: WorkAuthorization[];
  salaryExpectation: string | null;
  availability: string | null;
  answerBank: AnswerBankEntry[];
  verified: boolean;
  uncertainFields: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCandidateProfile(p: any): CandidateProfile {
  return {
    fullName: p.fullName ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    location: p.location ?? null,
    countryCode: p.countryCode ?? null,
    headline: p.headline ?? null,
    summary: p.summary ?? null,
    links: (p.links ?? []) as Link[],
    skills: p.skills ?? [],
    experience: (p.experience ?? []) as Experience[],
    education: (p.education ?? []) as Education[],
    projects: (p.projects ?? []) as Project[],
    certifications: (p.certifications ?? []) as Certification[],
    achievements: (p.achievements ?? []) as string[],
    languages: p.languages ?? [],
    yearsExperience: p.yearsExperience ?? null,
    workAuthorizations: (p.workAuthorizations ?? []) as WorkAuthorization[],
    salaryExpectation: p.salaryExpectation ?? null,
    availability: p.availability ?? null,
    answerBank: (p.answerBank ?? []) as AnswerBankEntry[],
    verified: !!p.verifiedAt && (p.uncertainFields ?? []).length === 0,
    uncertainFields: p.uncertainFields ?? [],
  };
}

/** Years of experience from dated roles (merging overlaps). Returns null if no dates parse. */
export function computeYearsExperience(experience: Experience[], now = new Date()): number | null {
  const ranges: [number, number][] = [];
  for (const e of experience) {
    const s = parseLooseDate(e.startDate);
    const end = e.current || /present|current|now/i.test(e.endDate ?? "") ? now.getTime() : parseLooseDate(e.endDate);
    if (s != null && end != null && end >= s) ranges.push([s, end]);
  }
  if (!ranges.length) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = ranges[0];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  total += ce - cs;
  return Math.round((total / (365.25 * 86400_000)) * 10) / 10;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseLooseDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  let m = t.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, 1);
  m = t.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return Date.UTC(+m[2], +m[1] - 1, 1);
  m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m && MONTHS.includes(m[1])) return Date.UTC(+m[2], MONTHS.indexOf(m[1]), 1);
  m = t.match(/^(\d{4})$/);
  if (m) return Date.UTC(+m[1], 0, 1);
  return null;
}
