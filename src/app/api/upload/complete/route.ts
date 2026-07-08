import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/dev-auth";
import { finalizeUpload } from "@/lib/upload/service";
import { completeUploadSchema } from "@/lib/validators/upload";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const { sessionId } = completeUploadSchema.parse(await req.json());
    const result = await finalizeUpload(user, sessionId);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
