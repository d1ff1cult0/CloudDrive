"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

interface Backend {
  id: string;
  name: string;
  type: "LOCAL" | "S3";
  enabled: boolean;
  isDefault: boolean;
  config: Record<string, unknown>;
}

const inputClass =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm";

export default function BackendsPage() {
  const [backends, setBackends] = useState<Backend[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // New backend form state.
  const [name, setName] = useState("");
  const [type, setType] = useState<"LOCAL" | "S3">("LOCAL");
  const [basePath, setBasePath] = useState("");
  const [s3, setS3] = useState({
    endpoint: "",
    region: "",
    bucket: "",
    accessKeyId: "",
    secretAccessKey: "",
    forcePathStyle: true,
  });
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/backends");
    if (res.ok) setBackends(await res.json());
  }
  useEffect(() => {
    void load();
  }, []);

  function currentConfig() {
    return type === "LOCAL"
      ? { basePath }
      : {
          endpoint: s3.endpoint || undefined,
          region: s3.region,
          bucket: s3.bucket,
          accessKeyId: s3.accessKeyId,
          secretAccessKey: s3.secretAccessKey,
          forcePathStyle: s3.forcePathStyle,
        };
  }

  async function testNew() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/backends/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, config: currentConfig() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Test failed");
      setStatus("Connection OK ✓");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/backends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, config: currentConfig() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Create failed");
      setName("");
      setBasePath("");
      setStatus("Backend created ✓");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, data: Record<string, unknown>, label: string) {
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/backends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      setError((await res.json()).message ?? "Update failed");
      return;
    }
    setStatus(label);
    await load();
  }

  async function testExisting(id: string) {
    setError(null);
    setStatus(null);
    const res = await fetch("/api/admin/backends/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backendId: id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.message ?? "Test failed");
    else setStatus("Connection OK ✓");
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Storage backends</h2>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {status && <p className="text-sm text-green-600">{status}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-b text-left text-xs">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Target</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {backends.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2 font-medium">
                  {b.name}
                  {b.isDefault && (
                    <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700 dark:bg-sky-900 dark:text-sky-200">
                      default
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{b.type}</td>
                <td className="text-muted-foreground px-4 py-2">
                  {b.type === "LOCAL"
                    ? String(b.config.basePath ?? "")
                    : `${b.config.bucket ?? ""} @ ${b.config.endpoint ?? "aws"}`}
                </td>
                <td className="px-4 py-2">
                  {b.enabled ? "enabled" : "disabled"}
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => void testExisting(b.id)}>
                      Test
                    </Button>
                    {!b.isDefault && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void patch(b.id, { isDefault: true }, "Default updated ✓")}
                      >
                        Make default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void patch(b.id, { enabled: !b.enabled }, "Updated ✓")
                      }
                    >
                      {b.enabled ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add backend */}
      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">Add backend</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-muted-foreground text-xs">
            Name
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-muted-foreground text-xs">
            Type
            <select
              className={inputClass}
              value={type}
              onChange={(e) => setType(e.target.value as "LOCAL" | "S3")}
            >
              <option value="LOCAL">LOCAL</option>
              <option value="S3">S3</option>
            </select>
          </label>
        </div>

        {type === "LOCAL" ? (
          <label className="text-muted-foreground text-xs">
            Base path
            <input
              className={inputClass}
              placeholder="/mnt/drive2"
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
            />
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(["endpoint", "region", "bucket", "accessKeyId", "secretAccessKey"] as const).map(
              (k) => (
                <label key={k} className="text-muted-foreground text-xs">
                  {k}
                  <input
                    className={inputClass}
                    type={k === "secretAccessKey" ? "password" : "text"}
                    value={s3[k]}
                    onChange={(e) => setS3((s) => ({ ...s, [k]: e.target.value }))}
                  />
                </label>
              ),
            )}
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={s3.forcePathStyle}
                onChange={(e) =>
                  setS3((s) => ({ ...s, forcePathStyle: e.target.checked }))
                }
              />
              forcePathStyle (MinIO)
            </label>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void testNew()}>
            Test connection
          </Button>
          <Button disabled={busy || !name.trim()} onClick={() => void create()}>
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
