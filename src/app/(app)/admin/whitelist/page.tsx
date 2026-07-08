"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

interface Entry {
  id: string;
  email: string;
  note: string | null;
  createdAt: string;
}

const inputClass =
  "border-input bg-background rounded-md border px-3 py-2 text-sm";

export default function WhitelistPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/whitelist");
    if (res.ok) setEntries(await res.json());
  }
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, note: note || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Failed");
      setEmail("");
      setNote("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/whitelist/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Signup whitelist</h2>
      <div className="flex flex-wrap items-end gap-2">
        <input
          className={inputClass}
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button disabled={busy || !email.trim()} onClick={() => void add()}>
          Add
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="rounded-lg border">
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1 font-medium">{e.email}</span>
              <span className="text-muted-foreground flex-1 truncate">
                {e.note}
              </span>
              <span className="text-muted-foreground hidden sm:block">
                {formatDate(e.createdAt)}
              </span>
              <button
                className="hover:bg-muted text-destructive rounded p-1.5"
                onClick={() => void remove(e.id)}
                aria-label="Remove"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
          {entries.length === 0 && (
            <li className="text-muted-foreground p-4 text-sm">
              No whitelisted emails.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
