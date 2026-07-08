import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth-session";
import { deleteFile, updateFile } from "@/lib/fs-service";
import { updateFileSchema } from "@/lib/validators/fs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const input = updateFileSchema.parse(await req.json());
    return NextResponse.json(await updateFile(user, id, input));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    await deleteFile(user, id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
