"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function SharePasswordGate({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/share/${token}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Incorrect password");
      return;
    }
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="bg-card border-border flex w-full max-w-xs flex-col gap-3 rounded-2xl border p-7 shadow-sm"
    >
      <h1 className="text-lg font-bold">Password required</h1>
      <p className="text-muted-foreground text-sm">
        This link is password protected.
      </p>
      <input
        type="password"
        autoFocus
        className="border-input bg-card focus:border-primary/60 rounded-lg border px-3 py-2 text-sm outline-none"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={busy || !password}>
        {busy ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}
