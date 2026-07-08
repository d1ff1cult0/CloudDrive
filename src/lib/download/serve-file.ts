// Shared file-serving logic with HTTP Range support (system-prompt §5.2).
// Used by the authed download route and (Phase 8) the public share route.
// The body is always a stream — the file is never read into memory.
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import type { File as FileRecord } from "@/generated/prisma/client";
import { getDriverForBackend } from "@/lib/storage/registry";
import { parseRange } from "./range";

function computeETag(file: FileRecord): string {
  const h = createHash("sha1")
    .update(`${file.id}:${file.updatedAt.toISOString()}`)
    .digest("hex")
    .slice(0, 27);
  return `"${h}"`;
}

function contentDisposition(name: string): string {
  const encoded = encodeURIComponent(name);
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function toWebStream(node: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>;
}

/**
 * Serve a READY file with Range support. `method` decides GET (streamed body)
 * vs HEAD (identical headers, empty body — download managers probe with HEAD).
 */
export async function serveFile(
  req: Request,
  file: FileRecord,
  method: "GET" | "HEAD" = "GET",
): Promise<Response> {
  const driver = await getDriverForBackend(file.storageBackendId);
  const totalSize = Number(file.sizeBytes);

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": file.mimeType,
    "Content-Disposition": contentDisposition(file.name),
    ETag: computeETag(file),
    "Last-Modified": file.updatedAt.toUTCString(),
    "Cache-Control": "private, no-transform",
  });

  const range = parseRange(req.headers.get("range"), totalSize);

  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${totalSize}`);
    return new Response(null, { status: 416, headers });
  }

  if (range === null) {
    // Full response.
    headers.set("Content-Length", String(totalSize));
    if (method === "HEAD") return new Response(null, { status: 200, headers });
    const stream = await driver.readRange({ key: file.storageKey });
    return new Response(toWebStream(stream), { status: 200, headers });
  }

  // Partial response.
  const { start, end } = range;
  headers.set("Content-Range", `bytes ${start}-${end}/${totalSize}`);
  headers.set("Content-Length", String(end - start + 1));
  if (method === "HEAD") return new Response(null, { status: 206, headers });
  const stream = await driver.readRange({ key: file.storageKey, start, end });
  return new Response(toWebStream(stream), { status: 206, headers });
}
