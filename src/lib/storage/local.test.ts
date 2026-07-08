import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalStorageDriver } from "./local";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  }
  return Buffer.concat(chunks);
}

describe("LocalStorageDriver", () => {
  let baseDir: string;
  let driver: LocalStorageDriver;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-local-"));
    driver = new LocalStorageDriver(baseDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("runs init → 3 chunks → complete → readRange(partial) → stat → delete", async () => {
    const key = "owner-123/file-abc";

    // Three chunks of varying size (last is smaller, like a real final chunk).
    const chunks = [
      Buffer.alloc(64 * 1024, 1),
      Buffer.alloc(64 * 1024, 2),
      Buffer.alloc(10 * 1024, 3),
    ];
    const full = Buffer.concat(chunks);
    const totalSize = full.length;

    await driver.initUpload(key, totalSize, "application/octet-stream");

    for (let i = 0; i < chunks.length; i++) {
      const res = await driver.writeChunk({
        key,
        chunkIndex: i,
        chunkStream: Readable.from(chunks[i]),
        chunkLength: chunks[i].length,
      });
      expect(res.eTag).toBeUndefined(); // local driver has no ETag
    }

    // Before completion the final key must not exist yet (only "<key>.part").
    expect(await driver.stat(key)).toBeNull();

    await driver.completeUpload({ key });

    // stat reflects the assembled file.
    const stat = await driver.stat(key);
    expect(stat).not.toBeNull();
    expect(stat?.sizeBytes).toBe(totalSize);

    // Full read matches the concatenated payload byte-for-byte.
    const readFull = await streamToBuffer(await driver.readRange({ key }));
    expect(readFull.equals(full)).toBe(true);

    // Partial read [start, end] inclusive — spans the chunk 0/1 boundary.
    const start = 64 * 1024 - 100;
    const end = 64 * 1024 + 99; // inclusive
    const partial = await streamToBuffer(
      await driver.readRange({ key, start, end }),
    );
    expect(partial.length).toBe(end - start + 1);
    expect(partial.equals(full.subarray(start, end + 1))).toBe(true);

    // Delete removes the file; stat then returns null.
    await driver.delete(key);
    expect(await driver.stat(key)).toBeNull();
  });

  it("rejects keys that escape the storage root", async () => {
    await expect(
      driver.initUpload("../escape", 0, "application/octet-stream"),
    ).rejects.toThrow(/escapes storage root/i);

    await expect(driver.readRange({ key: "../../etc/passwd" })).rejects.toThrow(
      /escapes storage root/i,
    );

    await expect(driver.stat("../../secret")).rejects.toThrow(
      /escapes storage root/i,
    );

    // An absolute path outside basePath is also rejected.
    await expect(driver.delete("/etc/hosts")).rejects.toThrow(
      /escapes storage root/i,
    );
  });
});
