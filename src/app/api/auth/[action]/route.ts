import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/api";

const Credentials = z.object({
  email: z.string().email().max(200).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().max(120).optional(),
});

// Simple in-memory brute-force limiter (per process). Use a shared store in multi-instance deployments.
const attempts = new Map<string, { n: number; until: number }>();
function throttle(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= 8) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
  attempts.set(key, a && a.until > now ? { n: a.n + 1, until: a.until } : { n: 1, until: now + 10 * 60_000 });
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await params;
    if (action === "logout") {
      await destroySession();
      return NextResponse.json({ ok: true });
    }
    const body = Credentials.parse(await req.json());
    throttle(`${action}:${body.email}`);
    if (action === "register") {
      const exists = await db.user.findUnique({ where: { email: body.email } });
      if (exists) throw new HttpError(409, "An account with this email already exists.");
      const user = await db.user.create({ data: { email: body.email, name: body.name, passwordHash: await hashPassword(body.password) } });
      await db.agentState.create({ data: { userId: user.id } });
      await createSession(user.id);
      await audit(user.id, "auth.register");
      return NextResponse.json({ ok: true });
    }
    if (action === "login") {
      const user = await db.user.findUnique({ where: { email: body.email } });
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw new HttpError(401, "Invalid email or password.");
      attempts.delete(`login:${body.email}`);
      await createSession(user.id);
      await audit(user.id, "auth.login");
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(404, "Unknown action");
  } catch (err) {
    return errorResponse(err);
  }
}
