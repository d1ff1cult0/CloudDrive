import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/http";
import {
  shareCookieName,
  shareCookieValue,
  verifySharePassword,
} from "@/lib/share-service";
import { verifyShareSchema } from "@/lib/validators/share";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

// POST /api/share/:token/verify { password } — sets a short-lived unlock cookie.
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    const { password } = verifyShareSchema.parse(await req.json());
    const share = await verifySharePassword(token, password); // throws 401 on mismatch

    const res = NextResponse.json({ ok: true });
    res.cookies.set(shareCookieName(token), shareCookieValue(share), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 6, // 6 hours
    });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
