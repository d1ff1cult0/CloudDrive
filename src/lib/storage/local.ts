// Local filesystem storage driver (system-prompt §4).
// Atomicity: chunks append to "<key>.part"; completeUpload renames to the final key.
// Path safety: physical path is path.resolve(basePath, key) and MUST stay inside
// basePath — any resolved path that escapes is rejected. Keys are server-generated
// (UUID-based), never derived from user filenames.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  CompleteUploadParams,
  InitUploadResult,
  ReadRangeParams,
  StorageDriver,
  WriteChunkParams,
  WriteChunkResult,
} from "./driver";

const PART_SUFFIX = ".part";

export class LocalStorageDriver implements StorageDriver {
  readonly type = "LOCAL" as const;
  private readonly basePath: string;

  constructor(basePath: string) {
    // Normalize once so all containment checks compare against the same root.
    this.basePath = path.resolve(basePath);
  }

  /** Resolve a storage key to an absolute path, rejecting anything that escapes basePath. */
  private resolveKeyPath(key: string): string {
    const full = path.resolve(this.basePath, key);
    if (full !== this.basePath && !full.startsWith(this.basePath + path.sep)) {
      throw new Error(`Path escapes storage root: ${key}`);
    }
    return full;
  }

  private partPath(key: string): string {
    return this.resolveKeyPath(key) + PART_SUFFIX;
  }

  async initUpload(
    key: string,
    _totalSize: number,
    _mimeType: string,
  ): Promise<InitUploadResult> {
    const partPath = this.partPath(key);
    await fsp.mkdir(path.dirname(partPath), { recursive: true });
    // Create/truncate the part file so appends start from a clean slate.
    await fsp.writeFile(partPath, "");
    return {};
  }

  async writeChunk(params: WriteChunkParams): Promise<WriteChunkResult> {
    const { key, chunkStream, chunkLength } = params;
    const partPath = this.partPath(key);
    // Sequential chunk order is enforced by the API layer, so appending is safe.
    const ws = fs.createWriteStream(partPath, { flags: "a" });
    await pipeline(chunkStream, ws);
    if (ws.bytesWritten !== chunkLength) {
      throw new Error(
        `Chunk byte mismatch for ${key}: wrote ${ws.bytesWritten}, expected ${chunkLength}`,
      );
    }
    return {};
  }

  async completeUpload(params: CompleteUploadParams): Promise<void> {
    const finalPath = this.resolveKeyPath(params.key);
    const partPath = this.partPath(params.key);
    await fsp.rename(partPath, finalPath);
  }

  async abortUpload(key: string, _externalUploadId?: string): Promise<void> {
    await this.unlinkIfExists(this.partPath(key));
  }

  async readRange(params: ReadRangeParams): Promise<Readable> {
    const full = this.resolveKeyPath(params.key);
    const options: { start?: number; end?: number } = {};
    if (params.start !== undefined) options.start = params.start;
    // fs.createReadStream `end` is inclusive, matching HTTP Range semantics.
    if (params.end !== undefined) options.end = params.end;
    return fs.createReadStream(full, options);
  }

  async stat(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const s = await fsp.stat(this.resolveKeyPath(key));
      return { sizeBytes: s.size };
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.unlinkIfExists(this.resolveKeyPath(key));
  }

  private async unlinkIfExists(p: string): Promise<void> {
    try {
      await fsp.unlink(p);
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function createLocalStorageDriver(basePath: string): LocalStorageDriver {
  return new LocalStorageDriver(basePath);
}
