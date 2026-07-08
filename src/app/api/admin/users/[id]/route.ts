import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth-session";
import { updateUser } from "@/lib/admin-service";
import { updateUserSchema } from "@/lib/validators/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin();
    const { id } = await params;
    const input = updateUserSchema.parse(await req.json());
    return NextResponse.json(await updateUser(id, input));
  } catch (err) {
    return errorResponse(err);
  }
}
