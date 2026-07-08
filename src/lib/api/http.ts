// Shared helpers for API route handlers: consistent JSON error mapping.
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { UploadError } from "@/lib/upload/service";

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof UploadError) {
    return NextResponse.json(
      { error: err.code, message: err.message, ...(err.extra ?? {}) },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: err.issues },
      { status: 400 },
    );
  }
  console.error("Unhandled API error:", err);
  return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
}
