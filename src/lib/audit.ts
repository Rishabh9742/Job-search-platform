import { Prisma } from "@prisma/client";
import { db } from "./db";

export async function audit(
  userId: string | null,
  action: string,
  entity?: { type: string; id: string },
  metadata?: Record<string, unknown>,
) {
  await db.auditLog.create({
    data: {
      userId,
      action,
      entityType: entity?.type,
      entityId: entity?.id,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function notify(userId: string, type: string, title: string, body?: string, link?: string) {
  await db.notification.create({ data: { userId, type, title, body, link } });
}
