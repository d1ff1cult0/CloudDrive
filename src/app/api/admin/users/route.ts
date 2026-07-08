import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth-session";
import { listUsers } from "@/lib/admin-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await listUsers());
  } catch (err) {
    return errorResponse(err);
  }
}
