import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { getFile } from "@/lib/storage";
import { extractResumeText } from "@/lib/resume/extract-text";
import { parseResume } from "@/lib/resume/parse";
import { countriesInText } from "@/lib/taxonomy/countries";
import { computeYearsExperience } from "@/lib/profile/schema";

/**
 * Parse an uploaded master resume and seed the editable profile. The original
 * file is never modified. Parsed values stay unverified until the user reviews them.
 */
export async function processResumeUpload(resumeId: string) {
  const resume = await db.masterResume.findUniqueOrThrow({ where: { id: resumeId } });
  await db.masterResume.update({ where: { id: resumeId }, data: { parseStatus: "PARSING", parseError: null } });
  try {
    const text = await extractResumeText(await getFile(resume.storageKey));
    if (text.length < 80) throw new Error("Could not read enough text from the file. If it is a scanned image, export a text-based PDF or DOCX.");
    const { data, parser } = await parseResume(text);
    await db.masterResume.update({ where: { id: resumeId }, data: { extractedText: text, parsedData: data as unknown as Prisma.InputJsonValue, parser, parseStatus: "PARSED" } });

    const countryCode = countriesInText(data.location)[0] ?? null;
    const years = computeYearsExperience(data.experience);
    const profileData = {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      location: data.location,
      countryCode,
      headline: data.headline,
      summary: data.summary,
      links: data.links as Prisma.InputJsonValue,
      skills: data.skills,
      experience: data.experience as unknown as Prisma.InputJsonValue,
      education: data.education as unknown as Prisma.InputJsonValue,
      projects: data.projects as unknown as Prisma.InputJsonValue,
      certifications: data.certifications as unknown as Prisma.InputJsonValue,
      achievements: data.achievements as unknown as Prisma.InputJsonValue,
      languages: data.languages,
      yearsExperience: years,
      uncertainFields: [...data.uncertainFields, ...(countryCode ? [] : ["countryCode"]), ...(years == null ? ["yearsExperience"] : [])],
      verifiedAt: null,
    };
    await db.userProfile.upsert({ where: { userId: resume.userId }, create: { userId: resume.userId, ...profileData }, update: profileData });
    await audit(resume.userId, "resume.parsed", { type: "MasterResume", id: resumeId }, { parser, uncertain: profileData.uncertainFields.length });
    await notify(resume.userId, "resume", "Resume parsed — please verify your profile", `${profileData.uncertainFields.length} field(s) need your review.`, "/resume");
    return { parser, uncertain: profileData.uncertainFields.length };
  } catch (err) {
    await db.masterResume.update({ where: { id: resumeId }, data: { parseStatus: "FAILED", parseError: (err as Error).message.slice(0, 500) } });
    throw err;
  }
}
