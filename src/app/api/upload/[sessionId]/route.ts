import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth-session";
import { abortUpload, getUploadStatus } from "@/lib/upload/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ sessionId: string }> };

// GET /api/upload/:sessionId — upload status (used by the client to resume).
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await getCurrentUser();
    const { sessionId } = await params;
    return NextResponse.json(await getUploadStatus(user, sessionId));
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/upload/:sessionId — abort: drop physical upload + File row.
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getCurrentUser();
    const { sessionId } = await params;
    return NextResponse.json(await abortUpload(user, sessionId));
  } catch (err) {
    return errorResponse(err);
  }
}
