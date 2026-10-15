import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { destroySession } from "@/lib/auth";
import { deleteUserFiles } from "@/lib/storage";
import { withUser } from "@/lib/api";
import { stopAgent } from "@/lib/pipeline/agent";

/** Permanently delete the account, all documents (files + rows), and history. */
export const DELETE = withUser(async (_req, user) => {
  await stopAgent(user.id).catch(() => undefined);
  await deleteUserFiles(user.id);
  await db.user.delete({ where: { id: user.id } });
  await destroySession();
  return NextResponse.json({ ok: true });
});
