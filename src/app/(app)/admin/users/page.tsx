"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
  quotaBytes: string;
  usedBytes: string;
  createdAt: string;
}

const GIB = 1024 ** 3;
const inputClass =
  "border-input bg-background w-24 rounded-md border px-2 py-1 text-sm";

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  // Per-row draft edits keyed by user id.
  const [drafts, setDrafts] = useState<Record<string, { quotaGiB: string; role: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const data: AdminUser[] = await res.json();
    setUsers(data);
    setDrafts(
      Object.fromEntries(
        data.map((u) => [
          u.id,
          { quotaGiB: (Number(u.quotaBytes) / GIB).toFixed(2), role: u.role },
        ]),
      ),
    );
  }
  useEffect(() => {
    void load();
  }, []);

  async function save(u: AdminUser) {
    const d = drafts[u.id];
    setSavingId(u.id);
    setError(null);
    try {
      const quotaBytes = Math.round(parseFloat(d.quotaGiB) * GIB);
      if (!Number.isFinite(quotaBytes) || quotaBytes < 0)
        throw new Error("Invalid quota");
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaBytes: String(quotaBytes), role: d.role }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Save failed");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Users</h2>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-b text-left text-xs">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Quota (GiB)</th>
              <th className="px-4 py-2">Used</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => {
              const d = drafts[u.id] ?? { quotaGiB: "", role: u.role };
              const dirty =
                d.role !== u.role ||
                Math.round(parseFloat(d.quotaGiB) * GIB) !== Number(u.quotaBytes);
              return (
                <tr key={u.id}>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">
                    <select
                      className="border-input bg-background rounded-md border px-2 py-1 text-sm"
                      value={d.role}
                      onChange={(e) =>
                        setDrafts((s) => ({
                          ...s,
                          [u.id]: { ...d, role: e.target.value },
                        }))
                      }
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      step="0.5"
                      value={d.quotaGiB}
                      onChange={(e) =>
                        setDrafts((s) => ({
                          ...s,
                          [u.id]: { ...d, quotaGiB: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="text-muted-foreground px-4 py-2">
                    {formatBytes(Number(u.usedBytes))}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!dirty || savingId === u.id}
                      onClick={() => void save(u)}
                    >
                      {savingId === u.id ? "Saving…" : "Save"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
