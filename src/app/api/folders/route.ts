import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth-session";
import { createFolder } from "@/lib/fs-service";
import { createFolderSchema } from "@/lib/validators/fs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const input = createFolderSchema.parse(await req.json());
    return NextResponse.json(await createFolder(user, input));
  } catch (err) {
    return errorResponse(err);
  }
}
