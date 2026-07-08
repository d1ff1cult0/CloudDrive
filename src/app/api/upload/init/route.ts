import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/dev-auth";
import { createUpload } from "@/lib/upload/service";
import { initUploadSchema } from "@/lib/validators/upload";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const input = initUploadSchema.parse(await req.json());
    const result = await createUpload(user, input);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
