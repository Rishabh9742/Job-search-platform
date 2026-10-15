import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { encryptString } from "@/lib/crypto";
import { HttpError, withUser } from "@/lib/api";

const Body = z.object({
  provider: z.enum(["GREENHOUSE", "LEVER"]),
  boardToken: z.string().trim().regex(/^[a-z0-9-_.]{1,80}$/i),
  secret: z.string().trim().min(8).max(500),
  label: z.string().max(100).optional(),
});

/** Employer-issued API keys, encrypted at rest. Secrets are never returned to the client. */
export const POST = withUser(async (req, user) => {
  const b = Body.parse(await req.json());
  const cred = await db.providerCredential.upsert({
    where: { userId_provider_boardToken: { userId: user.id, provider: b.provider, boardToken: b.boardToken } },
    create: { userId: user.id, provider: b.provider, boardToken: b.boardToken, encryptedSecret: encryptString(b.secret), label: b.label },
    update: { encryptedSecret: encryptString(b.secret), label: b.label },
  });
  await audit(user.id, "credential.saved", { type: "ProviderCredential", id: cred.id }, { provider: b.provider, boardToken: b.boardToken });
  return NextResponse.json({ ok: true });
});

export const DELETE = withUser(async (req, user) => {
  const id = new URL(req.url).searchParams.get("id");
  const cred = id ? await db.providerCredential.findFirst({ where: { id, userId: user.id } }) : null;
  if (!cred) throw new HttpError(404, "Not found");
  await db.providerCredential.delete({ where: { id: cred.id } });
  await audit(user.id, "credential.deleted", { type: "ProviderCredential", id: cred.id });
  return NextResponse.json({ ok: true });
});
