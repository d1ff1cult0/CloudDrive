"use client";

import { Copy, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";

export interface ShareTarget {
  kind: "file" | "folder";
  id: string;
  name: string;
}

interface ShareRow {
  id: string;
  token: string;
  url: string;
  hasPassword: boolean;
  expiresAt: string | null;
  downloadCount: number;
}

const inputClass =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm";

export function ShareDialog({
  target,
  onClose,
}: {
  target: ShareTarget | null;
  onClose: () => void;
}) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const key = target
    ? target.kind === "file"
      ? `fileId=${target.id}`
      : `folderId=${target.id}`
    : "";

  const load = useCallback(async () => {
    if (!target) return;
    const res = await fetch(`/api/shares?${key}`);
    if (res.ok) setShares(await res.json());
  }, [target, key]);

  useEffect(() => {
    setShares([]);
    setPassword("");
    setExpiresAt("");
    setError(null);
    if (target) void load();
  }, [target, load]);

  async function create() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        [target.kind === "file" ? "fileId" : "folderId"]: target.id,
      };
      if (password) body.password = password;
      if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Failed");
      setPassword("");
      setExpiresAt("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/shares/${id}`, { method: "DELETE" });
    await load();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={`Share “${target?.name ?? ""}”`}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-muted-foreground text-xs">
              Password (optional)
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="text-muted-foreground text-xs">
              Expires (optional)
              <input
                className={inputClass}
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
          </div>
          <Button disabled={busy} onClick={() => void create()}>
            Create link
          </Button>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        {shares.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-muted-foreground text-xs">Active links</p>
            {shares.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <input readOnly className={`${inputClass} flex-1`} value={s.url} />
                <button
                  className="hover:bg-muted rounded p-1.5"
                  onClick={() => void copy(s.url)}
                  aria-label="Copy"
                >
                  <Copy className="size-4" />
                </button>
                <button
                  className="hover:bg-muted text-destructive rounded p-1.5"
                  onClick={() => void revoke(s.id)}
                  aria-label="Revoke"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              {copied ? "Copied!" : " "}
            </p>
            <ul className="text-muted-foreground space-y-0.5 text-xs">
              {shares.map((s) => (
                <li key={s.id}>
                  {s.hasPassword ? "🔒 " : ""}
                  {s.expiresAt
                    ? `expires ${new Date(s.expiresAt).toLocaleString()}`
                    : "no expiry"}{" "}
                  · {s.downloadCount} downloads
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
