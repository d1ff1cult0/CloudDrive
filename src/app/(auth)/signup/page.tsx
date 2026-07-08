"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { signUp } from "@/lib/auth-client";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

const field =
  "border-input bg-card rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary/60";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await signUp.email({ name, email, password });
    setLoading(false);
    if (error) {
      // Non-whitelisted emails are rejected by the server before-signup hook.
      setError(error.message ?? "Sign up failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Brand className="mb-6 justify-center" />
        <div className="bg-card border-border rounded-2xl border p-7 shadow-sm">
          <h1 className="text-xl font-bold tracking-tight">Create your account</h1>
          <p className="text-muted-foreground mb-6 mt-1 text-sm">
            Signup is invite-only — your email must be whitelisted.
          </p>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Name
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={field}
                autoComplete="name"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={field}
                autoComplete="email"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={field}
                autoComplete="new-password"
              />
            </label>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? "Creating account…" : "Sign up"}
            </Button>
          </form>
        </div>
        <p className="text-muted-foreground mt-5 text-center text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
