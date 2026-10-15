import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { HttpError, withUser } from "@/lib/api";
import { providerByKey, syncJobSources } from "@/lib/jobs/registry";

const Body = z.object({
  enabled: z.boolean().optional(),
  boards: z.array(z.string().trim().regex(/^[a-z0-9-_.]{1,80}$/i, "Board tokens may only contain letters, digits, - _ .")).max(200).optional(),
});

/** Sources are shared public-data configuration (not user data). */
export const PATCH = withUser<{ params: Promise<{ key: string }> }>(async (req, user, { params }) => {
  const { key } = await params;
  const provider = providerByKey(key);
  if (!provider) throw new HttpError(404, "Unknown source");
  const body = Body.parse(await req.json());
  await syncJobSources();
  const src = await db.jobSource.findUniqueOrThrow({ where: { key } });
  const config = { ...(src.config as object), ...(body.boards ? { boards: body.boards } : {}) };
  await db.jobSource.update({ where: { key }, data: { ...(body.enabled != null ? { enabled: body.enabled } : {}), config, ...(body.boards ? { lastFetchedAt: null } : {}) } });
  await audit(user.id, "source.updated", { type: "JobSource", id: key }, body);
  return NextResponse.json({ ok: true });
});
