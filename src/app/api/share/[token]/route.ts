import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import {
  getShareByToken,
  getShareContents,
  isUnlocked,
  shareCookieName,
} from "@/lib/share-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

// GET /api/share/:token[?folderId=...] — public metadata / folder listing.
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    const share = await getShareByToken(token);

    const cookieVal = (await cookies()).get(shareCookieName(token))?.value;
    if (!isUnlocked(share, cookieVal)) {
      return NextResponse.json({
        locked: true,
        requiresPassword: true,
        type: share.fileId ? "file" : "folder",
      });
    }

    const folderId = new URL(req.url).searchParams.get("folderId");
    return NextResponse.json(await getShareContents(share, folderId));
  } catch (err) {
    return errorResponse(err);
  }
}
