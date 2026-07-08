import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth-session";
import { removeWhitelist } from "@/lib/admin-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    await removeWhitelist(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
