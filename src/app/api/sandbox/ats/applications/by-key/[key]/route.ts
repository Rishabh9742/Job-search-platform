import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { sandboxApiKey } from "@/lib/apply/adapters/sandbox";

/** Status lookup used for confirmation verification of uncertain sandbox submissions. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const h = req.headers.get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(`${sandboxApiKey()}:`).toString("base64")}`;
  if (h.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(expected))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sub = await db.sandboxSubmission.findUnique({ where: { idempotencyKey: (await params).key } });
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ confirmation_id: sub.confirmationId, created_at: sub.createdAt.toISOString(), board: sub.boardToken, job: sub.jobRef });
}
