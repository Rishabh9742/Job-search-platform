import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, withUser } from "@/lib/api";
import { agentReadiness, getAgent, pauseAgent, resumeAgent, startAgent, stopAgent } from "@/lib/pipeline/agent";

const Body = z.object({ action: z.enum(["start", "pause", "resume", "stop"]) });

export const GET = withUser(async (_req, user) => NextResponse.json(await getAgent(user.id)));

export const POST = withUser(async (req, user) => {
  const { action } = Body.parse(await req.json());
  const agent = await getAgent(user.id);
  if (action === "start") {
    const problems = await agentReadiness(user.id);
    if (problems.length) throw new HttpError(400, problems.join(" "));
    await startAgent(user.id);
  } else if (action === "pause") {
    if (agent.status !== "RUNNING") throw new HttpError(409, "Agent is not running");
    await pauseAgent(user.id);
  } else if (action === "resume") {
    if (agent.status !== "PAUSED") throw new HttpError(409, "Agent is not paused");
    await resumeAgent(user.id);
  } else await stopAgent(user.id);
  return NextResponse.json(await getAgent(user.id));
});
