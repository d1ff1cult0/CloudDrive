import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth-session";
import { cleanupStaleUploadSessions } from "@/lib/jobs/cleanup";

export const runtime = "nodejs";

// POST /api/admin/gc — remove stale upload sessions.
// Authenticated: admin session, OR a matching Bearer token when CRON_SECRET is set
// (so an external scheduler can call it without a session).
export async function POST(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authorized = cronSecret
      ? req.headers.get("authorization") === `Bearer ${cronSecret}`
      : false;

    if (!authorized) {
      await requireAdmin();
    }

    const result = await cleanupStaleUploadSessions();
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
