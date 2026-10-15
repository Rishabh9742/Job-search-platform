import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { getFile, putFile } from "@/lib/storage";
import { decryptString, encryptString } from "@/lib/crypto";

describe("secure storage", () => {
  it("encrypts files at rest and round-trips", async () => {
    const key = await putFile("user_1", "pdf", Buffer.from("%PDF-secret resume"));
    const onDisk = await fs.readFile(path.join(process.env.STORAGE_DIR!, key));
    expect(onDisk.includes(Buffer.from("secret resume"))).toBe(false);
    expect((await getFile(key)).toString()).toBe("%PDF-secret resume");
  });
  it("rejects path traversal keys", async () => {
    await expect(getFile("../etc/passwd")).rejects.toThrow(/Invalid storage key/);
    await expect(getFile("a/../../b")).rejects.toThrow(/Invalid storage key/);
  });
  it("encrypts credentials", () => {
    const c = encryptString("employer-key");
    expect(c).not.toContain("employer-key");
    expect(decryptString(c)).toBe("employer-key");
  });
});
