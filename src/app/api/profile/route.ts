import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { HttpError, withUser } from "@/lib/api";
import { ProfileUpdateSchema } from "@/lib/profile/schema";

export const GET = withUser(async (_req, user) => {
  return NextResponse.json(await db.userProfile.findUnique({ where: { userId: user.id } }));
});

export const PUT = withUser(async (req, user) => {
  const body = ProfileUpdateSchema.parse(await req.json());
  if (body.markVerified && body.uncertainFields.length) throw new HttpError(400, `Confirm or fix the ${body.uncertainFields.length} highlighted field(s) before verifying.`);
  if (body.markVerified && !body.fullName?.trim()) throw new HttpError(400, "Name is required.");
  if (body.markVerified && !body.email?.trim()) throw new HttpError(400, "Email is required.");
  const data = {
    fullName: body.fullName,
    email: body.email,
    phone: body.phone,
    location: body.location,
    countryCode: body.countryCode,
    headline: body.headline,
    summary: body.summary,
    links: body.links as Prisma.InputJsonValue,
    skills: [...new Set(body.skills.map((s) => s.trim()).filter(Boolean))],
    experience: body.experience as Prisma.InputJsonValue,
    education: body.education as Prisma.InputJsonValue,
    projects: body.projects as Prisma.InputJsonValue,
    certifications: body.certifications as Prisma.InputJsonValue,
    achievements: body.achievements as Prisma.InputJsonValue,
    languages: body.languages,
    yearsExperience: body.yearsExperience,
    workAuthorizations: body.workAuthorizations as Prisma.InputJsonValue,
    salaryExpectation: body.salaryExpectation,
    availability: body.availability,
    answerBank: body.answerBank as Prisma.InputJsonValue,
    uncertainFields: body.uncertainFields,
    // Any edit after verification keeps it verified only if the user re-confirms.
    verifiedAt: body.markVerified ? new Date() : null,
  };
  const profile = await db.userProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  await audit(user.id, body.markVerified ? "profile.verified" : "profile.updated", { type: "UserProfile", id: profile.id });
  return NextResponse.json({ ok: true, verified: !!profile.verifiedAt });
});
