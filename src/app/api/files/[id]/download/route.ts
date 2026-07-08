import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { serveFile } from "@/lib/download/serve-file";
import type { File as FileRecord } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Load the file and authorize the current user (throws AuthError if not signed in).
async function loadOwnedReadyFile(
  id: string,
): Promise<FileRecord | NextResponse> {
  const user = await getCurrentUser();
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (file.status !== "READY") {
    return NextResponse.json({ error: "NOT_READY" }, { status: 409 });
  }
  return file;
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const result = await loadOwnedReadyFile(id);
    if (result instanceof NextResponse) return result;
    return serveFile(req, result, "GET");
  } catch (err) {
    return errorResponse(err);
  }
}

export async function HEAD(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const result = await loadOwnedReadyFile(id);
    if (result instanceof NextResponse) return result;
    return serveFile(req, result, "HEAD");
  } catch (err) {
    return errorResponse(err);
  }
}
