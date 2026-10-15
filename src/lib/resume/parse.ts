import { extractSkills, canonicalSkill } from "@/lib/taxonomy/skills";
import { countriesInText } from "@/lib/taxonomy/countries";
import { AiRefusalError, AiUnavailableError, structured } from "@/lib/ai/client";
import { ParsedResumeSchema, type Experience, type Education, type ParsedResume, type Project } from "@/lib/profile/schema";

const SECTION_ALIASES: Record<string, RegExp> = {
  summary: /^(professional\s+)?(summary|profile|about( me)?|objective|career objective)$/i,
  experience: /^(work\s+|professional\s+|employment\s+)?(experience|history|employment)( history)?$/i,
  education: /^(education|academic (background|qualifications)|qualifications)$/i,
  skills: /^((technical|core|key)\s+)?(skills|competencies|technologies|tech stack|skills & tools|skills and tools)$/i,
  projects: /^((personal|academic|selected|key)\s+)?projects$/i,
  certifications: /^(certifications?|licenses?( & certifications)?|courses)$/i,
  achievements: /^(achievements|awards|honou?rs|accomplishments|awards & achievements)$/i,
  languages: /^languages?$/i,
};

const DATE = String.raw`(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}[/-]\d{4}|\d{4}[/-]\d{1,2}|\d{4})`;
const RANGE_RE = new RegExp(String.raw`(${DATE})\s*(?:-|–|—|to)\s*(${DATE}|present|current|now|till date|ongoing)`, "i");

export function splitSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = { header: [] };
  let current = "header";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bare = line.replace(/[:\-–_|]+$/g, "").trim();
    const hit = bare.length < 40 ? Object.entries(SECTION_ALIASES).find(([, re]) => re.test(bare)) : undefined;
    if (hit) {
      current = hit[0];
      sections[current] ??= [];
      continue;
    }
    (sections[current] ??= []).push(line);
  }
  return sections;
}

const isBullet = (l: string) => /^[•●▪◦\-*–·]\s*/.test(l);
const stripBullet = (l: string) => l.replace(/^[•●▪◦\-*–·]\s*/, "").trim();

function parseExperience(lines: string[]): Experience[] {
  const out: Experience[] = [];
  let cur: Experience | null = null;
  let pendingHeader: string[] = [];
  for (const line of lines) {
    const range = line.match(RANGE_RE);
    if (range) {
      const header = [...pendingHeader, line.replace(RANGE_RE, "").replace(/[|,–-]\s*$/, "").trim()].filter(Boolean);
      const [first = "", second = ""] = header.length >= 2 ? header : (header[0] ?? "").split(/\s*,\s+|\s+(?:at|@|\||–|—|-)\s+/);
      cur = {
        title: first.trim(),
        company: second.trim(),
        startDate: range[1],
        endDate: /present|current|now|till|ongoing/i.test(range[2]) ? "Present" : range[2],
        current: /present|current|now|till|ongoing/i.test(range[2]),
        location: null,
        bullets: [],
      };
      out.push(cur);
      pendingHeader = [];
    } else if (cur && (isBullet(line) || line.length > 60)) {
      cur.bullets.push(stripBullet(line));
    } else {
      pendingHeader.push(line);
      if (pendingHeader.length > 2) pendingHeader.shift();
    }
  }
  return out;
}

function parseEducation(lines: string[]): Education[] {
  const out: Education[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/(university|college|institute|school|academy|iit|nit|polytechnic)/i.test(l)) {
      const range = l.match(RANGE_RE) ?? lines[i + 1]?.match(RANGE_RE);
      const degreeLine = [lines[i - 1], lines[i + 1]].find((x) => x && /(bachelor|master|b\.?\s?tech|m\.?\s?tech|b\.?sc|m\.?sc|b\.?e\b|mba|phd|diploma|degree|b\.?a\b|m\.?a\b|bca|mca)/i.test(x));
      out.push({ institution: l.replace(RANGE_RE, "").replace(/[|,–-]\s*$/, "").trim(), degree: degreeLine?.replace(RANGE_RE, "").trim() ?? null, field: null, startDate: range?.[1] ?? null, endDate: range?.[2] ?? null, grade: null });
    }
  }
  return out;
}

function parseProjects(lines: string[]): Project[] {
  const out: Project[] = [];
  let cur: Project | null = null;
  for (const line of lines) {
    if (!isBullet(line) && line.length < 90) {
      cur = { name: line.split(/\s+[|–—-]\s+/)[0].trim(), description: null, technologies: extractSkills(line), url: line.match(/https?:\/\/\S+/)?.[0] ?? null, bullets: [] };
      out.push(cur);
    } else if (cur) {
      cur.bullets.push(stripBullet(line));
      for (const s of extractSkills(line)) if (!cur.technologies.includes(s)) cur.technologies.push(s);
    }
  }
  return out;
}

/** Deterministic, rule-based resume parser. Conservative: marks structured sections as uncertain. */
export function parseResumeHeuristic(text: string): ParsedResume {
  const sections = splitSections(text);
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
  const phone = text.match(/(\+?\d[\d\s().-]{8,}\d)/)?.[0]?.trim() ?? null;
  const urls = [...new Set(text.match(/(https?:\/\/[^\s|,]+|(?:www\.)?(?:linkedin\.com|github\.com)\/[^\s|,]+)/gi) ?? [])];
  const header = sections.header ?? [];
  const nameLine = header.find((l) => !/[@\d]|https?:|linkedin|github/i.test(l) && l.split(/\s+/).length <= 5 && /^[\p{L} .'-]+$/u.test(l));

  const skillsText = (sections.skills ?? []).join("\n");
  const listed = skillsText
    .split(/[,;|•\n]/)
    .map((s) => s.replace(/^[^:]{0,30}:\s*/, "").trim())
    .filter((s) => s.length > 1 && s.length < 40);
  const skills = [...new Set([...listed.map(canonicalSkill), ...extractSkills(skillsText || text)])];

  const experience = parseExperience(sections.experience ?? []);
  const education = parseEducation(sections.education ?? []);
  const projects = parseProjects(sections.projects ?? []);

  const uncertain: string[] = [];
  if (!nameLine) uncertain.push("fullName");
  if (!email) uncertain.push("email");
  experience.forEach((e, i) => {
    if (!e.title || !e.company) uncertain.push(`experience.${i}`);
  });
  if (experience.length) uncertain.push("experience");
  if (education.length) uncertain.push("education");
  if (!skillsText) uncertain.push("skills");

  // Contact lines are often "City, Country | email | phone" — inspect each segment.
  const segments = header.filter((l) => l !== nameLine).flatMap((l) => l.split(/\s*[|•·]\s*/));
  const loc = segments.find((s) => /^[\p{L} .'-]+,\s*[\p{L} .'-]+$/u.test(s.trim()) && s.length < 60 && countriesInText(s).length > 0)?.trim() ?? segments.find((s) => /,\s*[A-Z][a-z]+/.test(s) && !/[@\d]/.test(s) && s.length < 60)?.trim() ?? null;

  return {
    fullName: nameLine ?? null,
    email,
    phone,
    location: loc,
    headline: null,
    summary: (sections.summary ?? []).join(" ").trim() || null,
    links: urls.map((u) => ({ label: /linkedin/i.test(u) ? "LinkedIn" : /github/i.test(u) ? "GitHub" : "Website", url: u.startsWith("http") ? u : `https://${u}` })),
    skills,
    experience,
    education,
    projects,
    certifications: (sections.certifications ?? []).map((l) => ({ name: stripBullet(l), issuer: null, date: null })),
    achievements: (sections.achievements ?? []).map(stripBullet),
    languages: (sections.languages ?? []).flatMap((l) => l.split(/[,;|]/)).map((s) => s.trim()).filter(Boolean),
    uncertainFields: uncertain,
  };
}

const SYSTEM = `You extract structured candidate profiles from resume text for a job-application assistant.
Rules:
- Use ONLY information literally present in the resume text. Never infer, embellish, or invent employers, titles, dates, skills, metrics, degrees, or links.
- Copy bullet points faithfully (you may fix whitespace/line-wrapping only).
- Dates: keep the resume's own wording (e.g. "Jan 2021", "2019"); use "Present" for ongoing roles; null if absent.
- skills: only skills explicitly named in the resume.
- headline: the candidate's own stated title/headline if present, else null.
- uncertainFields: list dotted paths (e.g. "experience.1.company", "education.0.endDate", "fullName") wherever the text was ambiguous, garbled, split across columns, or you had to choose between interpretations. Be conservative — when in doubt, include it.`;

/** AI-first parsing with a factual guard; falls back to the rule-based parser. */
export async function parseResume(text: string): Promise<{ data: ParsedResume; parser: string }> {
  try {
    const data = await structured({
      system: SYSTEM,
      user: `<resume_text>\n${text}\n</resume_text>`,
      schema: ParsedResumeSchema,
      effort: "medium",
    });
    return { data: guardAgainstFabrication(data, text), parser: "ai" };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) console.warn("[resume] AI parse failed, using rule-based parser:", (err as Error).message);
    if (err instanceof AiRefusalError) console.warn("[resume] refusal");
    return { data: parseResumeHeuristic(text), parser: "heuristic" };
  }
}

/** Drop any extracted skill/employer/institution that does not literally appear in the source text. */
export function guardAgainstFabrication(data: ParsedResume, text: string): ParsedResume {
  const hay = text.toLowerCase().replace(/\s+/g, " ");
  const present = (s: string | null | undefined) => !s || hay.includes(s.toLowerCase().replace(/\s+/g, " ").trim());
  const uncertain = new Set(data.uncertainFields);
  const skills = data.skills.filter((s) => present(s) || extractSkills(text).includes(canonicalSkill(s)));
  if (skills.length !== data.skills.length) uncertain.add("skills");
  data.experience.forEach((e, i) => {
    if (!present(e.company)) uncertain.add(`experience.${i}.company`);
    if (!present(e.title)) uncertain.add(`experience.${i}.title`);
  });
  data.education.forEach((e, i) => {
    if (!present(e.institution)) uncertain.add(`education.${i}.institution`);
  });
  if (data.email && !present(data.email)) {
    uncertain.add("email");
  }
  return { ...data, skills, uncertainFields: [...uncertain] };
}
