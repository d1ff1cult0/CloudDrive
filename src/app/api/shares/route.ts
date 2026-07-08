import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth-session";
import { createShare, listSharesForItem } from "@/lib/share-service";
import { createShareSchema } from "@/lib/validators/share";

export const runtime = "nodejs";

// GET /api/shares?fileId=|folderId=  — list this user's shares for an item.
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    const sp = new URL(req.url).searchParams;
    const fileId = sp.get("fileId") ?? undefined;
    const folderId = sp.get("folderId") ?? undefined;
    return NextResponse.json(await listSharesForItem(user, { fileId, folderId }));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const input = createShareSchema.parse(await req.json());
    return NextResponse.json(await createShare(user, input));
  } catch (err) {
    return errorResponse(err);
  }
}
