import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { serveFile } from "@/lib/download/serve-file";
import {
  getShareByToken,
  incrementDownloadCount,
  isUnlocked,
  resolveShareFile,
  shareCookieName,
} from "@/lib/share-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

async function handle(req: Request, token: string, method: "GET" | "HEAD") {
  const share = await getShareByToken(token);

  const cookieVal = (await cookies()).get(shareCookieName(token))?.value;
  if (!isUnlocked(share, cookieVal)) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }

  const fileId = new URL(req.url).searchParams.get("fileId");
  const file = await resolveShareFile(share, fileId);

  // Count a download once per "fresh" GET (no Range, or a range starting at 0),
  // so resumable/parallel range requests don't inflate the count.
  if (method === "GET") {
    const range = req.headers.get("range");
    if (!range || /^bytes=0-/.test(range)) {
      await incrementDownloadCount(share.id);
    }
  }

  return serveFile(req, file, method);
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    return await handle(req, token, "GET");
  } catch (err) {
    return errorResponse(err);
  }
}

export async function HEAD(req: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    return await handle(req, token, "HEAD");
  } catch (err) {
    return errorResponse(err);
  }
}
