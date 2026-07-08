import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth-session";
import { testBackend } from "@/lib/admin-service";
import { testBackendSchema } from "@/lib/validators/admin";

export const runtime = "nodejs";

// POST /api/admin/backends/test — probe a saved backend ({backendId}) or an
// unsaved config ({type, config}) by writing/reading/deleting a probe object.
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const input = testBackendSchema.parse(await req.json());
    return NextResponse.json(await testBackend(input));
  } catch (err) {
    return errorResponse(err);
  }
}
