// BetterAuth browser client. baseURL defaults to the current origin (single-host
// app), so it's omitted here.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
