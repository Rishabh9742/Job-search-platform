import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withUser } from "@/lib/api";
import { DEFAULT_PREFERENCES, PreferencesSchema } from "@/lib/preferences";

export const GET = withUser(async (_req, user) => {
  return NextResponse.json((await db.jobPreferences.findUnique({ where: { userId: user.id } })) ?? DEFAULT_PREFERENCES);
});

export const PUT = withUser(async (req, user) => {
  const body = PreferencesSchema.parse(await req.json());
  const prefs = await db.jobPreferences.upsert({ where: { userId: user.id }, create: { userId: user.id, ...DEFAULT_PREFERENCES, ...body }, update: body });
  await audit(user.id, "preferences.updated", { type: "JobPreferences", id: prefs.id }, { fields: Object.keys(body) });
  return NextResponse.json({ ok: true });
});
