import { extractSkills, canonicalSkill } from "@/lib/taxonomy/skills";
import { CATEGORIES, categoriesForTitle, customRoleCategory, requiredYears } from "@/lib/taxonomy/categories";
import { countryInRegion, countryName } from "@/lib/taxonomy/countries";
import type { CandidateProfile } from "@/lib/profile/schema";

export interface MatchJob {
  title: string;
  company: string;
  description: string;
  countries: string[];
  remoteRegions: string[];
  isRemote: boolean;
  workArrangement: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  employmentType: string | null;
  experienceLevel: string | null;
  tags: string[];
  postedAt: Date | null;
  status: string;
  sourceKey: string;
  isMock: boolean;
}

export interface MatchPreferences {
  categories: string[];
  customRoles: string[];
  keywords: string[];
  excludedKeywords: string[];
  countries: string[];
  includeWorldwideRemote: boolean;
  workArrangements: string[];
  employmentTypes: string[];
  experienceLevels: string[];
  salaryMin: number | null;
  salaryCurrency: string | null;
  minMatchScore: number;
  excludedCompanies: string[];
  excludedIndustries: string[];
  maxPostingAgeDays: number | null;
}

export interface MatchResult {
  score: number;
  /** Passes all hard rules — shown as a match. */
  eligible: boolean;
  /** Eligible AND above threshold AND no unknowns that need the user. */
  autoApplyEligible: boolean;
  matchedCategory: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  breakdown: { factor: string; weight: number; points: number; detail: string }[];
  reasons: { included: string[]; excluded: string[] };
  /** Unknown/critical information that blocks automatic submission. */
  blockers: string[];
}

const PREFERRED_HEADING = /\n[^\n]{0,40}\b(nice to have|nice-to-have|preferred|bonus( points)?|pluses|a plus|good to have|desirable)\b[^\n]{0,40}\n/i;
const REQUIRED_HEADING = /\n[^\n]{0,40}\b(requirements|required|qualifications|must[- ]have|what you('ll)? (need|bring)|who you are|you have)\b[^\n]{0,40}\n/i;

/** Split a JD into required vs preferred skill sets (heading-based, conservative). */
export function jobSkillSets(description: string, tags: string[] = []) {
  const text = `\n${description}\n`;
  const pref = text.match(PREFERRED_HEADING);
  let requiredText = text;
  let preferredText = "";
  if (pref?.index != null) {
    requiredText = text.slice(0, pref.index);
    const rest = text.slice(pref.index + pref[0].length);
    const back = rest.match(REQUIRED_HEADING);
    preferredText = back?.index != null ? rest.slice(0, back.index) : rest;
    if (back?.index != null) requiredText += rest.slice(back.index);
  }
  const tagSkills = extractSkills(tags.join(", "));
  const required = [...new Set([...extractSkills(requiredText), ...tagSkills])];
  const preferred = extractSkills(preferredText).filter((s) => !required.includes(s));
  return { required, preferred };
}

const norm = (s: string) => s.toLowerCase().trim();
const LEVEL_ORDER = ["ENTRY", "JUNIOR", "MID", "SENIOR", "LEAD"];

function candidateLevel(years: number | null): string | null {
  if (years == null) return null;
  if (years < 1) return "ENTRY";
  if (years < 2.5) return "JUNIOR";
  if (years < 5) return "MID";
  if (years < 9) return "SENIOR";
  return "LEAD";
}

export function matchJob(job: MatchJob, profile: CandidateProfile, prefs: MatchPreferences, now = new Date()): MatchResult {
  const included: string[] = [];
  const excluded: string[] = [];
  const blockers: string[] = [];
  const breakdown: MatchResult["breakdown"] = [];
  const desc = job.description;
  const lowerDesc = desc.toLowerCase();

  // ── Hard rules ────────────────────────────────────────────────────────
  if (job.status === "CLOSED") excluded.push("Listing is closed");

  const customCats = prefs.customRoles.map(customRoleCategory);
  const jobCats = categoriesForTitle(job.title, customCats);
  const wantedCats = [...prefs.categories, ...customCats.map((c) => c.id)];
  const keywordHit = prefs.keywords.find((k) => job.title.toLowerCase().includes(norm(k)));
  const matchedCategory = jobCats.find((c) => wantedCats.includes(c)) ?? null;
  if (wantedCats.length || prefs.keywords.length) {
    if (matchedCategory) {
      const label = CATEGORIES.find((c) => c.id === matchedCategory)?.label ?? matchedCategory.replace(/^custom:/, "");
      included.push(`Title matches your category "${label}"`);
    } else if (keywordHit) included.push(`Title contains your keyword "${keywordHit}"`);
    else excluded.push(`Title "${job.title}" is outside your selected categories`);
  }

  const companyLc = norm(job.company);
  const exCompany = prefs.excludedCompanies.find((c) => c.trim() && companyLc.includes(norm(c)));
  if (exCompany) excluded.push(`Employer is in your excluded list (${exCompany})`);
  const exKeyword = prefs.excludedKeywords.find((k) => k.trim() && (job.title.toLowerCase().includes(norm(k)) || lowerDesc.includes(norm(k))));
  if (exKeyword) excluded.push(`Contains excluded keyword "${exKeyword}"`);
  const exIndustry = prefs.excludedIndustries.find((k) => k.trim() && (lowerDesc.includes(norm(k)) || job.tags.some((t) => norm(t).includes(norm(k)))));
  if (exIndustry) excluded.push(`Mentions excluded industry "${exIndustry}"`);

  // Location / remote eligibility
  const home = profile.countryCode;
  let locationOk = false;
  let locationDetail = "";
  if (job.isRemote) {
    const allowed = prefs.workArrangements.length === 0 || prefs.workArrangements.includes("REMOTE");
    if (!allowed) excluded.push("Remote roles are not in your preferred work arrangements");
    const regions = job.remoteRegions;
    if (regions.includes("WORLDWIDE")) {
      locationOk = prefs.includeWorldwideRemote || !!home;
      locationDetail = "Remote, open worldwide";
    } else if (job.countries.length || regions.length) {
      const inCountry = home ? job.countries.includes(home) : false;
      const inRegion = home ? regions.some((r) => countryInRegion(home, r)) : false;
      const prefMatch = job.countries.some((c) => prefs.countries.includes(c));
      if (inCountry || inRegion) {
        locationOk = true;
        locationDetail = `Remote, open to candidates in ${home ? countryName(home) : "your country"}`;
      } else if (!home && prefMatch) {
        locationOk = true;
        locationDetail = "Remote within a preferred country";
        blockers.push("Your country of residence is not set — cannot confirm remote eligibility");
      } else {
        excluded.push(`Remote role restricted to ${[...job.countries.map(countryName), ...regions].join(", ")}`);
      }
    } else {
      locationOk = true;
      locationDetail = "Remote; eligible locations not stated";
      blockers.push("Remote location eligibility is not stated by the source");
    }
  } else if (job.countries.length) {
    const hit = prefs.countries.length === 0 ? job.countries : job.countries.filter((c) => prefs.countries.includes(c));
    if (hit.length) {
      locationOk = true;
      locationDetail = `${job.workArrangement === "HYBRID" ? "Hybrid" : "On-site"} in ${hit.map(countryName).join(", ")}`;
    } else excluded.push(`Located in ${job.countries.map(countryName).join(", ")}, outside your selected countries`);
    if (prefs.workArrangements.length && job.workArrangement !== "UNKNOWN" && !prefs.workArrangements.includes(job.workArrangement))
      excluded.push(`${job.workArrangement.toLowerCase()} roles are not in your preferred work arrangements`);
  } else {
    blockers.push("Job location is not provided by the source");
    locationDetail = "Location unknown";
  }
  if (locationOk) included.push(locationDetail);

  // Work authorization & sponsorship (only for country-bound roles)
  const boundCountries = job.isRemote ? job.countries : job.countries.filter((c) => prefs.countries.length === 0 || prefs.countries.includes(c));
  const noSponsorship = /\b(no|not|unable to|cannot|can't|do not|does not|will not)\b[^.]{0,40}\b(visa )?sponsor/i.test(desc) || /without (the need for )?(visa )?sponsorship/i.test(desc);
  const citizenOnly = /\b(u\.?s\.? citizenship (is )?required|must be a u\.?s\.? citizen|security clearance)\b/i.test(desc) || (job.sourceKey === "usajobs" && /u\.?s\.? citizens/i.test(desc));
  if (boundCountries.length && !(job.isRemote && job.remoteRegions.includes("WORLDWIDE"))) {
    const decl = boundCountries.map((c) => ({ c, a: profile.workAuthorizations.find((w) => w.countryCode === c) }));
    const authorized = decl.find((d) => d.a?.authorized && !d.a.requiresSponsorship);
    const needsSponsor = decl.find((d) => d.a && (d.a.requiresSponsorship || !d.a.authorized));
    if (authorized) included.push(`You declared work authorization in ${countryName(authorized.c)}`);
    else if (needsSponsor) {
      if (noSponsorship || citizenOnly) excluded.push(`Employer does not sponsor visas and you need sponsorship in ${countryName(needsSponsor.c)}`);
      else blockers.push(`You require sponsorship in ${countryName(needsSponsor.c)}; the listing does not say whether it sponsors`);
    } else blockers.push(`Work authorization for ${boundCountries.map(countryName).join("/")} is not declared in your profile`);
  }

  // Employment type / level / age / salary
  if (job.employmentType && prefs.employmentTypes.length && !prefs.employmentTypes.includes(job.employmentType))
    excluded.push(`Employment type ${job.employmentType.replace("_", "-").toLowerCase()} is not in your preferences`);
  if (job.experienceLevel && prefs.experienceLevels.length && !prefs.experienceLevels.includes(job.experienceLevel))
    excluded.push(`Seniority ${job.experienceLevel.toLowerCase()} is not in your preferred levels`);

  if (prefs.maxPostingAgeDays) {
    if (job.postedAt) {
      const ageDays = (now.getTime() - job.postedAt.getTime()) / 86400_000;
      if (ageDays > prefs.maxPostingAgeDays) excluded.push(`Posted ${Math.floor(ageDays)} days ago (limit ${prefs.maxPostingAgeDays})`);
    } else blockers.push("Publication date not provided by the source — cannot check posting age");
  }

  if (prefs.salaryMin && job.salaryMax && job.salaryCurrency && prefs.salaryCurrency && job.salaryCurrency === prefs.salaryCurrency && (job.salaryPeriod ?? "YEAR") === "YEAR") {
    if (job.salaryMax < prefs.salaryMin) excluded.push(`Salary up to ${job.salaryCurrency} ${job.salaryMax.toLocaleString()} is below your minimum`);
    else included.push(`Salary range meets your minimum`);
  }

  const reqYears = requiredYears(desc);
  const years = profile.yearsExperience;
  if (reqYears != null) {
    if (years == null) blockers.push(`Job requires ${reqYears}+ years; your years of experience are not set`);
    else if (years + 1 < reqYears) excluded.push(`Requires ${reqYears}+ years of experience; you have ${years}`);
  }

  // ── Weighted relevance ────────────────────────────────────────────────
  const { required, preferred } = jobSkillSets(desc, job.tags);
  const mine = new Set(profile.skills.map((s) => canonicalSkill(s).toLowerCase()));
  const has = (s: string) => mine.has(s.toLowerCase());
  const matchedSkills = [...required, ...preferred].filter(has);
  const missingSkills = required.filter((s) => !has(s));

  const add = (factor: string, weight: number, ratio: number, detail: string) => breakdown.push({ factor, weight, points: Math.round(weight * Math.max(0, Math.min(1, ratio))), detail });

  add("Required skills", 35, required.length ? required.filter(has).length / required.length : 0.5, required.length ? `${required.filter(has).length}/${required.length} required skills found in your profile` : "No recognizable required skills in the listing");
  add("Preferred skills", 10, preferred.length ? preferred.filter(has).length / preferred.length : 0.5, preferred.length ? `${preferred.filter(has).length}/${preferred.length} preferred skills` : "No preferred-skills section");

  const pastTitles = profile.experience.map((e) => e.title).join(" | ");
  const pastCats = categoriesForTitle(pastTitles, customCats);
  const titleRatio = matchedCategory ? (pastCats.includes(matchedCategory) ? 1 : 0.7) : keywordHit ? 0.6 : jobCats.some((c) => pastCats.includes(c)) ? 0.5 : 0.1;
  add("Role relevance", 15, titleRatio, matchedCategory && pastCats.includes(matchedCategory) ? "Your past titles are in the same category" : matchedCategory ? "Matches a selected category" : "Weak title relevance");

  let expRatio = 0.5;
  let expDetail = "Experience requirement not stated";
  const myLevel = candidateLevel(years);
  if (reqYears != null && years != null) {
    expRatio = years >= reqYears ? 1 : Math.max(0, 1 - (reqYears - years) / Math.max(reqYears, 1));
    expDetail = `Requires ${reqYears}+ years, you have ${years}`;
  } else if (job.experienceLevel && myLevel) {
    const diff = Math.abs(LEVEL_ORDER.indexOf(job.experienceLevel) - LEVEL_ORDER.indexOf(myLevel));
    expRatio = diff === 0 ? 1 : diff === 1 ? 0.6 : 0.2;
    expDetail = `Role level ${job.experienceLevel.toLowerCase()}, your level ${myLevel.toLowerCase()}`;
  }
  add("Experience", 15, expRatio, expDetail);
  add("Location & arrangement", 10, locationOk ? 1 : 0, locationDetail || "Not eligible by location");

  const projTech = new Set(profile.projects.flatMap((p) => p.technologies.map((t) => canonicalSkill(t).toLowerCase())));
  const projHits = required.filter((s) => projTech.has(s.toLowerCase())).length;
  add("Relevant projects", 5, required.length ? Math.min(1, projHits / Math.min(3, required.length)) : 0, `${projHits} required skills demonstrated in your projects`);

  const needsDegree = /\b(bachelor'?s?|master'?s?|degree|b\.?s\.?|m\.?s\.?|phd)\b/i.test(desc);
  const hasDegree = profile.education.some((e) => e.degree);
  const certHit = profile.certifications.some((c) => lowerDesc.includes(c.name.toLowerCase().split(/[(-]/)[0].trim()));
  add("Education & certifications", 5, needsDegree ? (hasDegree ? 1 : 0.2) : 0.8 + (certHit ? 0.2 : 0), needsDegree ? (hasDegree ? "Degree requirement met" : "Listing mentions a degree; none in profile") : "No explicit degree requirement");

  const age = job.postedAt ? (now.getTime() - job.postedAt.getTime()) / 86400_000 : null;
  add("Freshness", 5, age == null ? 0.3 : age < 7 ? 1 : age < 21 ? 0.6 : 0.2, age == null ? "Posting date unavailable" : `Posted ${Math.max(0, Math.floor(age))} days ago`);

  const score = Math.max(0, Math.min(100, breakdown.reduce((a, b) => a + b.points, 0)));
  const eligible = excluded.length === 0;
  if (!profile.verified) blockers.push("Your profile has not been verified yet");
  if (job.isMock) blockers.push("Mock listing (development data)");
  if (eligible && score < prefs.minMatchScore) excluded.push(`Match score ${score} is below your minimum of ${prefs.minMatchScore}`);
  if (matchedSkills.length) included.push(`Matching skills: ${matchedSkills.slice(0, 8).join(", ")}`);

  const aboveThreshold = score >= prefs.minMatchScore;
  return {
    score,
    eligible,
    autoApplyEligible: eligible && aboveThreshold && blockers.filter((b) => !b.startsWith("Mock")).length === 0,
    matchedCategory,
    matchedSkills,
    missingSkills,
    breakdown,
    reasons: { included, excluded },
    blockers: [...new Set(blockers)],
  };
}
