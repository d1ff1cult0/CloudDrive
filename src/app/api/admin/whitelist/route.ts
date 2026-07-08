import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth-session";
import { addWhitelist, listWhitelist } from "@/lib/admin-service";
import { addWhitelistSchema } from "@/lib/validators/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await listWhitelist());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const input = addWhitelistSchema.parse(await req.json());
    return NextResponse.json(await addWhitelist(admin.id, input));
  } catch (err) {
    return errorResponse(err);
  }
}
