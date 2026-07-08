import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth-session";
import { createBackend, listBackends } from "@/lib/admin-service";
import { createBackendSchema } from "@/lib/validators/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await listBackends());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const input = createBackendSchema.parse(await req.json());
    const created = await createBackend(input);
    return NextResponse.json({ id: created.id, name: created.name });
  } catch (err) {
    return errorResponse(err);
  }
}
