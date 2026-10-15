import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser, type SessionUser } from "./auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps a route handler with authentication and uniform error responses. */
export function withUser<Ctx>(handler: (req: Request, user: SessionUser, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const user = await currentUser();
      if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      return await handler(req, user, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError)
    return NextResponse.json(
      { error: "Invalid input", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  console.error("[api] unhandled error", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
