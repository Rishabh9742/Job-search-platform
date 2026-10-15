import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env";
import { decryptBuffer, encryptBuffer } from "./crypto";

/**
 * Encrypted-at-rest local file storage. Keys are namespaced per user
 * (`<userId>/<uuid>.<ext>`); callers must authorize access before reading.
 */
function root() {
  return path.resolve(env().STORAGE_DIR);
}

function resolveKey(key: string) {
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return path.join(root(), key);
}

export async function putFile(owner: string, ext: string, data: Buffer): Promise<string> {
  const key = `${owner}/${crypto.randomUUID()}.${ext.replace(/[^a-z0-9]/gi, "")}`;
  const file = resolveKey(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, encryptBuffer(data));
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  return decryptBuffer(await fs.readFile(resolveKey(key)));
}

export async function deleteFile(key: string): Promise<void> {
  await fs.rm(resolveKey(key), { force: true });
}

export async function deleteUserFiles(userId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error("Invalid user id");
  await fs.rm(path.join(root(), userId), { recursive: true, force: true });
}

export const keyBelongsTo = (key: string, userId: string) => key.startsWith(`${userId}/`);
