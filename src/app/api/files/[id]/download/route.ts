import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dev-auth";
import { serveFile } from "@/lib/download/serve-file";
import type { File as FileRecord } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Load the file and authorize the current user, or return an error Response.
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
  const { id } = await params;
  const result = await loadOwnedReadyFile(id);
  if (result instanceof NextResponse) return result;
  return serveFile(req, result, "GET");
}

export async function HEAD(req: Request, { params }: Ctx) {
  const { id } = await params;
  const result = await loadOwnedReadyFile(id);
  if (result instanceof NextResponse) return result;
  return serveFile(req, result, "HEAD");
}
