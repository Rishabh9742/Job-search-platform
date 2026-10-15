import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { HttpError, withUser } from "@/lib/api";
import { enqueue, QUEUES } from "@/lib/queue/queues";

/** Run discovery + matching now (background). Does not submit anything unless the agent is running. */
export const POST = withUser(async (_req, user) => {
  const prefs = await db.jobPreferences.findUnique({ where: { userId: user.id } });
  if (!prefs) throw new HttpError(400, "Set your job preferences in Settings first.");
  const job = await enqueue(QUEUES.discovery, "discovery", { userId: user.id, manual: true }, { dedupeId: `discovery-now-${user.id}` });
  return NextResponse.json({ queued: true, jobId: job.id });
});
