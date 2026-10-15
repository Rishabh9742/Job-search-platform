import type { CandidateProfile } from "@/lib/profile/schema";
import { countryName, countriesInText } from "@/lib/taxonomy/countries";

export type FieldType = "text" | "textarea" | "file" | "select" | "multiselect" | "boolean" | "hidden";

/** Provider-neutral application form field. */
export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: { label: string; value: string }[];
  description?: string | null;
  /** Alternative keys satisfying the same question (e.g. resume vs resume_text). */
  alternatives?: string[];
}

export interface FieldAnswer {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  value: string | null;
  /** For selects: the option value (provider id) chosen. */
  source: "PROFILE" | "ANSWER_BANK" | "AI" | "DOCUMENT" | "USER" | "NONE";
  sensitive: boolean;
  requiresUserInput: boolean;
  reason?: string;
  options?: { label: string; value: string }[];
}

export interface MapContext {
  profile: CandidateProfile;
  jobCountries: string[];
  jobTitle: string;
  company: string;
  hasResume: boolean;
  hasCoverLetter: boolean;
  /** Answers the user already provided for this application (key → value). */
  userAnswers: Record<string, string>;
  /** Optional generator for open-ended motivational questions. */
  openAnswers?: Record<string, string>;
}

const SENSITIVE = /\b(gender|sex\b|race|racial|ethnic|ethnicity|hispanic|latino|veteran|disabilit|pronoun|sexual orientation|transgender|religio|age\b|date of birth|criminal|convict|felony|marital|pregnan|national origin|caste)\b/i;
const LEGAL = /\b(i (hereby )?(certify|confirm|acknowledge|agree|consent|attest|declare)|privacy (policy|notice)|terms|gdpr|consent to|data processing|background check|non-compete|true and complete)\b/i;
const SPONSOR = /\bsponsor/i;
const AUTH = /\b(authori[sz]ed|authori[sz]ation|right to work|eligible to work|legally (able|permitted|allowed) to work|work permit|visa status)\b/i;
const SALARY = /\b(salary|compensation|pay expectation|expected pay|desired pay|ctc)\b/i;
const START = /\b(start date|notice period|when can you start|earliest start|availability to start|available to start)\b/i;
const COUNTRY_Q = /\b(which country|country (of|where) (you )?(residence|reside|live|based)|currently (based|located|reside|live) in|where are you (based|located))\b/i;
const OPEN_ABOUT = /\b(tell us about yourself|introduce yourself|about you)\b/i;
const OPEN_WHY_ROLE = /\bwhy (are you|do you).*(interested|apply|applying).*(role|position|job)|why this (role|position)\b/i;
const OPEN_WHY_COMPANY = /\bwhy (do you want to work|are you interested in working|.*join)\b/i;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function similarity(a: string, b: string) {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

function pickOption(options: FormField["options"], wanted: "yes" | "no") {
  return options?.find((o) => norm(o.label) === wanted || norm(o.label).startsWith(`${wanted} `));
}

/**
 * Map every form field to a value from the verified profile, the user's saved
 * answer bank, generated documents, or flag it for user input. Never fabricates
 * declarations (authorization, sponsorship, demographics, legal attestations).
 */
export function mapFormFields(fields: FormField[], ctx: MapContext): FieldAnswer[] {
  const p = ctx.profile;
  const [first, ...rest] = (p.fullName ?? "").trim().split(/\s+/);
  const last = rest.join(" ");
  const linkedin = p.links.find((l) => /linkedin/i.test(l.url))?.url ?? null;
  const github = p.links.find((l) => /github/i.test(l.url))?.url ?? null;
  const website = p.links.find((l) => !/linkedin|github/i.test(l.url))?.url ?? null;
  const declFor = ctx.jobCountries.map((c) => p.workAuthorizations.find((w) => w.countryCode === c)).find(Boolean);

  return fields.map((f): FieldAnswer => {
    const base = { key: f.key, label: f.label, type: f.type, required: f.required, options: f.options };
    const out = (value: string | null, source: FieldAnswer["source"], extra: Partial<FieldAnswer> = {}): FieldAnswer => ({ ...base, value, source, sensitive: false, requiresUserInput: false, ...extra });
    const need = (reason: string, sensitive = false): FieldAnswer => ({ ...base, value: null, source: "NONE", sensitive, requiresUserInput: f.required, reason });
    const label = `${f.label} ${f.description ?? ""}`;

    if (ctx.userAnswers[f.key] != null) return out(ctx.userAnswers[f.key], "USER");
    if (f.type === "hidden") return out(null, "NONE", { reason: "hidden field (not populated)" });

    // Standard identity fields
    const k = f.key.toLowerCase();
    if (k === "first_name" || /^first name$/i.test(f.label)) return first ? out(first, "PROFILE") : need("Name missing from profile");
    if (k === "last_name" || /^last name$/i.test(f.label)) return last ? out(last, "PROFILE") : need("Last name missing from profile");
    if (k === "name" || /^(full )?name$/i.test(f.label)) return p.fullName ? out(p.fullName, "PROFILE") : need("Name missing");
    if (k === "email" || /^e-?mail/i.test(f.label)) return p.email ? out(p.email, "PROFILE") : need("Email missing from profile");
    if (k === "phone" || /^phone/i.test(f.label)) return p.phone ? out(p.phone, "PROFILE") : need("Phone missing from profile");
    if ((k === "location" || /^location( \(city\))?$/i.test(f.label)) && f.type === "text") return p.location ? out(p.location, "PROFILE") : need("Location missing from profile");
    if (k === "org" || /^current (company|employer)$/i.test(f.label)) {
      const cur = p.experience.find((e) => e.current);
      return cur ? out(cur.company, "PROFILE") : out(null, "NONE", { reason: "No current employer in profile" });
    }
    if (k === "resume" || k === "resume_text" || /^resume|^cv\b/i.test(f.label)) return ctx.hasResume ? out("[tailored resume]", "DOCUMENT") : need("No resume generated");
    if (k === "cover_letter" || k === "cover_letter_text" || /^cover letter/i.test(f.label)) return ctx.hasCoverLetter ? out("[cover letter]", "DOCUMENT") : f.required ? need("No cover letter generated") : out(null, "NONE");
    if (/linkedin/i.test(label) && f.type === "text") return linkedin ? out(linkedin, "PROFILE") : f.required ? need("No LinkedIn URL in profile") : out(null, "NONE");
    if (/github/i.test(label) && f.type === "text") return github ? out(github, "PROFILE") : f.required ? need("No GitHub URL in profile") : out(null, "NONE");
    if (/\b(website|portfolio)\b/i.test(label) && f.type === "text") return website ? out(website, "PROFILE") : f.required ? need("No website in profile") : out(null, "NONE");

    // Sensitive & legal — never automatic
    if (SENSITIVE.test(label)) return f.required ? need("Sensitive/demographic question — requires your explicit answer", true) : out(null, "NONE", { sensitive: true, reason: "Voluntary demographic question left blank" });
    if (LEGAL.test(label) || f.type === "boolean") {
      const bank = p.answerBank.find((a) => similarity(a.question, f.label) >= 0.7);
      if (bank && !LEGAL.test(label)) return out(bank.answer, "ANSWER_BANK");
      return f.required ? need("Legal declaration / acknowledgement — requires your confirmation", true) : out(null, "NONE", { sensitive: true });
    }

    // Sponsorship / authorization (only when the user has declared it for this job's country)
    if (SPONSOR.test(label)) {
      if (!declFor) return need(`Sponsorship status for ${ctx.jobCountries.map(countryName).join("/") || "this job's country"} not declared in your profile`, true);
      const choice = pickOption(f.options, declFor.requiresSponsorship ? "yes" : "no");
      if (f.type === "select" && !choice) return need("Could not map your sponsorship answer to the form's options", true);
      return out(choice?.value ?? (declFor.requiresSponsorship ? "Yes" : "No"), "PROFILE", { sensitive: true });
    }
    if (AUTH.test(label)) {
      if (!declFor) return need(`Work authorization for ${ctx.jobCountries.map(countryName).join("/") || "this job's country"} not declared`, true);
      if (f.type === "select") {
        const simple = pickOption(f.options, declFor.authorized ? "yes" : "no");
        if (simple) return out(simple.value, "PROFILE", { sensitive: true });
        return need("Work-authorization options are not a simple yes/no — please choose", true);
      }
      return out(declFor.authorized ? "Yes" : "No", "PROFILE", { sensitive: true });
    }
    if (COUNTRY_Q.test(label) && f.type === "select" && p.countryCode) {
      const opt = f.options?.find((o) => countriesInText(o.label).includes(p.countryCode!));
      if (opt) return out(opt.value, "PROFILE");
      return need(`Your country (${countryName(p.countryCode)}) is not among the options`);
    }
    if (SALARY.test(label)) return p.salaryExpectation && f.type !== "select" ? out(p.salaryExpectation, "PROFILE") : need("Salary expectation not set (or form requires a specific option)");
    if (START.test(label)) return p.availability && f.type !== "select" ? out(p.availability, "PROFILE") : need("Availability / start date not set");

    // Saved answers
    const bank = p.answerBank.map((a) => ({ a, s: similarity(a.question, f.label) })).sort((x, y) => y.s - x.s)[0];
    if (bank && bank.s >= 0.6) {
      if (f.type === "select") {
        const opt = f.options?.find((o) => norm(o.label) === norm(bank.a.answer));
        if (opt) return out(opt.value, "ANSWER_BANK");
      } else return out(bank.a.answer, "ANSWER_BANK");
    }

    // Open-ended motivational questions from verified profile (generated + fact-checked upstream)
    if (f.type === "textarea" || f.type === "text") {
      const kind = OPEN_ABOUT.test(label) ? "about" : OPEN_WHY_ROLE.test(label) ? "whyRole" : OPEN_WHY_COMPANY.test(label) ? "whyCompany" : null;
      if (kind && ctx.openAnswers?.[kind]) return out(ctx.openAnswers[kind], "AI");
    }

    return f.required ? need("Unconfigured question — please answer (you can save it to your answer bank)") : out(null, "NONE", { reason: "Optional question skipped" });
  });
}

export const unresolved = (answers: FieldAnswer[]) => answers.filter((a) => a.requiresUserInput && !a.value);
