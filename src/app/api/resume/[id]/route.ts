import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { deleteFile, getFile } from "@/lib/storage";
import { HttpError, withUser } from "@/lib/api";
import { enqueue, QUEUES } from "@/lib/queue/queues";

type Ctx = { params: Promise<{ id: string }> };

async function owned(userId: string, id: string) {
  const r = await db.masterResume.findFirst({ where: { id, userId } });
  if (!r) throw new HttpError(404, "Resume not found");
  return r;
}

/** Download the original, unmodified upload. */
export const GET = withUser<Ctx>(async (_req, user, { params }) => {
  const r = await owned(user.id, (await params).id);
  const data = await getFile(r.storageKey);
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": r.mimeType, "Content-Disposition": `attachment; filename="${encodeURIComponent(r.fileName)}"`, "Cache-Control": "private, no-store" },
  });
});

/** Re-run parsing. */
export const POST = withUser<Ctx>(async (_req, user, { params }) => {
  const r = await owned(user.id, (await params).id);
  await enqueue(QUEUES.resumeParse, "parse-resume", { userId: user.id, resumeId: r.id, manual: true });
  return NextResponse.json({ ok: true });
});

export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  const r = await owned(user.id, (await params).id);
  await deleteFile(r.storageKey);
  await db.masterResume.delete({ where: { id: r.id } });
  await audit(user.id, "resume.deleted", { type: "MasterResume", id: r.id });
  return NextResponse.json({ ok: true });
});
