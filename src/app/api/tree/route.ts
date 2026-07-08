import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth-session";
import { listFolder } from "@/lib/fs-service";

export const runtime = "nodejs";

// GET /api/tree?folderId=...  (omit folderId for the user root)
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    const folderId = new URL(req.url).searchParams.get("folderId");
    return NextResponse.json(await listFolder(user, folderId || null));
  } catch (err) {
    return errorResponse(err);
  }
}
