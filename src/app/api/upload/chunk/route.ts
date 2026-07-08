import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth-session";
import { receiveChunk, UploadError } from "@/lib/upload/service";

export const runtime = "nodejs";

// PUT /api/upload/chunk?sessionId=...&index=N
// Body is the raw binary chunk (application/octet-stream) — streamed, never buffered.
export async function PUT(req: Request) {
  try {
    const user = await getCurrentUser();

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const indexRaw = searchParams.get("index");
    if (!sessionId || indexRaw === null) {
      throw new UploadError(400, "BAD_REQUEST", "sessionId and index are required");
    }
    const index = Number(indexRaw);
    if (!Number.isInteger(index) || index < 0) {
      throw new UploadError(400, "BAD_REQUEST", "index must be a non-negative integer");
    }

    const contentLength = req.headers.get("content-length");
    if (!contentLength) {
      throw new UploadError(411, "LENGTH_REQUIRED", "Content-Length is required");
    }
    const chunkLength = Number(contentLength);
    if (!Number.isInteger(chunkLength) || chunkLength < 0) {
      throw new UploadError(400, "BAD_REQUEST", "Invalid Content-Length");
    }

    if (!req.body) {
      throw new UploadError(400, "BAD_REQUEST", "Missing request body");
    }
    const chunkStream = Readable.fromWeb(
      req.body as unknown as NodeWebReadableStream<Uint8Array>,
    );

    const result = await receiveChunk({
      user,
      sessionId,
      index,
      chunkStream,
      chunkLength,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
