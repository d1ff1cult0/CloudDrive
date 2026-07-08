import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth-session";
import { deleteShare } from "@/lib/share-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    await deleteShare(user, id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
