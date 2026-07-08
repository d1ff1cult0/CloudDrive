"use client";

import {
  ChevronRight,
  Download,
  File as FileIcon,
  Folder as FolderIcon,
  FolderPlus,
  Home,
  Pencil,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import { Modal } from "@/components/modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate } from "@/lib/format";
import { uploadFile } from "@/lib/upload/chunked-uploader";

interface TreeData {
  folder: { id: string; name: string } | null;
  breadcrumbs: { id: string; name: string }[];
  folders: { id: string; name: string; createdAt: string; storageBackendId: string | null }[];
  files: { id: string; name: string; sizeBytes: string; mimeType: string; createdAt: string }[];
  quota: { usedBytes: string; quotaBytes: string };
  backends: { id: string; name: string; type: string; isDefault: boolean }[];
}

interface UploadItem {
  id: string;
  name: string;
  progress: number; // 0..1
  status: "uploading" | "done" | "error";
  error?: string;
}

const inputClass =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm";

export function FileBrowser({
  folderId,
  isAdmin = false,
}: {
  folderId: string | null;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<TreeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderBackend, setNewFolderBackend] = useState<string>("");

  const [renaming, setRenaming] = useState<{ kind: "folder" | "file"; id: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ kind: "folder" | "file"; id: string; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
    const res = await fetch(`/api/tree${qs}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? `Failed to load (HTTP ${res.status})`);
      return;
    }
    setData(await res.json());
  }, [folderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ---------- uploads ----------
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      for (const file of list) {
        const uid = crypto.randomUUID();
        setUploads((u) => [
          ...u,
          { id: uid, name: file.name, progress: 0, status: "uploading" },
        ]);
        try {
          await uploadFile({
            file,
            folderId,
            onProgress: (p) =>
              setUploads((u) =>
                u.map((it) =>
                  it.id === uid
                    ? { ...it, progress: p.uploadedBytes / Math.max(1, p.totalBytes) }
                    : it,
                ),
              ),
          });
          setUploads((u) =>
            u.map((it) =>
              it.id === uid ? { ...it, progress: 1, status: "done" } : it,
            ),
          );
        } catch (e) {
          setUploads((u) =>
            u.map((it) =>
              it.id === uid
                ? { ...it, status: "error", error: (e as Error).message }
                : it,
            ),
          );
        }
      }
      await refresh();
    },
    [folderId, refresh],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  }

  // ---------- folder/file actions ----------
  async function createFolder() {
    setBusy(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName,
          parentId: folderId,
          storageBackendId: newFolderBackend || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Failed to create folder");
      }
      setNewFolderOpen(false);
      setNewFolderName("");
      setNewFolderBackend("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRename() {
    if (!renaming) return;
    setBusy(true);
    try {
      const path = renaming.kind === "folder" ? "folders" : "files";
      const res = await fetch(`/api/${path}/${renaming.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Rename failed");
      }
      setRenaming(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const path = deleteTarget.kind === "folder" ? "folders" : "files";
      const res = await fetch(`/api/${path}/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Delete failed");
      }
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function navigate(id: string | null) {
    router.push(id ? `/dashboard/${id}` : "/dashboard");
  }

  const used = data ? Number(data.quota.usedBytes) : 0;
  const total = data ? Number(data.quota.quotaBytes) : 1;
  const pct = Math.min(100, Math.round((used / Math.max(1, total)) * 100));

  return (
    <div
      className="mx-auto w-full max-w-5xl p-4 sm:p-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Header */}
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Vault</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/admin"
              className="hover:bg-muted flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm"
            >
              <Settings className="size-4" /> Admin
            </Link>
          )}
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      {/* Quota */}
      {data && (
        <div className="mb-4">
          <div className="text-muted-foreground mb-1 flex justify-between text-xs">
            <span>Storage</span>
            <span>
              {formatBytes(used)} / {formatBytes(total)} ({pct}%)
            </span>
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Toolbar + breadcrumbs */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-sm">
          <button
            className="hover:text-foreground text-muted-foreground flex items-center gap-1"
            onClick={() => navigate(null)}
          >
            <Home className="size-4" /> Home
          </button>
          {data?.breadcrumbs.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight className="text-muted-foreground size-3" />
              <button
                className="hover:text-foreground text-muted-foreground"
                onClick={() => navigate(b.id)}
              >
                {b.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="size-4" /> New folder
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4" /> Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {error && (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      )}

      {/* Upload queue */}
      {uploads.length > 0 && (
        <div className="mb-4 space-y-2 rounded-md border p-3">
          {uploads.map((u) => (
            <div key={u.id} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="truncate">{u.name}</span>
                <span className="text-muted-foreground ml-2 shrink-0">
                  {u.status === "error"
                    ? "Error"
                    : u.status === "done"
                      ? "Done"
                      : `${Math.round(u.progress * 100)}%`}
                </span>
              </div>
              <div className="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${u.status === "error" ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${u.progress * 100}%` }}
                />
              </div>
              {u.error && <p className="text-destructive text-xs">{u.error}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Listing */}
      <div
        className={`rounded-lg border ${dragging ? "border-primary bg-primary/5" : ""}`}
      >
        {data && data.folders.length === 0 && data.files.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            This folder is empty. Drag files here or use Upload.
          </p>
        ) : (
          <ul className="divide-y">
            {data?.folders.map((f) => (
              <li key={f.id} className="group flex items-center gap-3 px-4 py-2.5">
                <FolderIcon className="size-5 shrink-0 text-sky-500" />
                {renaming?.kind === "folder" && renaming.id === f.id ? (
                  <RenameInline
                    value={renameValue}
                    setValue={setRenameValue}
                    onSubmit={submitRename}
                    onCancel={() => setRenaming(null)}
                    busy={busy}
                  />
                ) : (
                  <button
                    className="flex-1 truncate text-left text-sm hover:underline"
                    onClick={() => navigate(f.id)}
                  >
                    {f.name}
                  </button>
                )}
                <span className="text-muted-foreground hidden w-24 shrink-0 text-right text-xs sm:block">
                  {formatDate(f.createdAt)}
                </span>
                <RowActions
                  onRename={() => {
                    setRenaming({ kind: "folder", id: f.id });
                    setRenameValue(f.name);
                  }}
                  onDelete={() =>
                    setDeleteTarget({ kind: "folder", id: f.id, name: f.name })
                  }
                />
              </li>
            ))}
            {data?.files.map((f) => (
              <li key={f.id} className="group flex items-center gap-3 px-4 py-2.5">
                <FileIcon className="text-muted-foreground size-5 shrink-0" />
                {renaming?.kind === "file" && renaming.id === f.id ? (
                  <RenameInline
                    value={renameValue}
                    setValue={setRenameValue}
                    onSubmit={submitRename}
                    onCancel={() => setRenaming(null)}
                    busy={busy}
                  />
                ) : (
                  <span className="flex-1 truncate text-sm">{f.name}</span>
                )}
                <span className="text-muted-foreground hidden w-20 shrink-0 text-right text-xs sm:block">
                  {formatBytes(Number(f.sizeBytes))}
                </span>
                <span className="text-muted-foreground hidden w-24 shrink-0 text-right text-xs sm:block">
                  {formatDate(f.createdAt)}
                </span>
                <div className="flex items-center gap-1">
                  <a
                    href={`/api/files/${f.id}/download`}
                    className="hover:bg-muted rounded p-1.5"
                    aria-label="Download"
                  >
                    <Download className="size-4" />
                  </a>
                  <RowActions
                    onRename={() => {
                      setRenaming({ kind: "file", id: f.id });
                      setRenameValue(f.name);
                    }}
                    onDelete={() =>
                      setDeleteTarget({ kind: "file", id: f.id, name: f.name })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* New folder modal */}
      <Modal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title="New folder"
      >
        <div className="space-y-3">
          <input
            autoFocus
            className={inputClass}
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolderName.trim()) void createFolder();
            }}
          />
          {data && data.backends.length > 0 && (
            <label className="text-muted-foreground block text-xs">
              Storage backend
              <select
                className={inputClass}
                value={newFolderBackend}
                onChange={(e) => setNewFolderBackend(e.target.value)}
              >
                <option value="">Inherit / default</option>
                {data.backends.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.type}){b.isDefault ? " • default" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !newFolderName.trim()}
              onClick={() => void createFolder()}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.kind ?? ""}`}
      >
        <p className="text-muted-foreground mb-4 text-sm">
          Delete <strong>{deleteTarget?.name}</strong>
          {deleteTarget?.kind === "folder"
            ? " and everything inside it? "
            : "? "}
          This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void confirmDelete()}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function RowActions({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button className="hover:bg-muted rounded p-1.5" onClick={onRename} aria-label="Rename">
        <Pencil className="size-4" />
      </button>
      <button
        className="hover:bg-muted text-destructive rounded p-1.5"
        onClick={onDelete}
        aria-label="Delete"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function RenameInline({
  value,
  setValue,
  onSubmit,
  onCancel,
  busy,
}: {
  value: string;
  setValue: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <input
        autoFocus
        className={inputClass}
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <Button size="sm" disabled={busy} onClick={onSubmit}>
        Save
      </Button>
      <button className="hover:bg-muted rounded p-1.5" onClick={onCancel} aria-label="Cancel">
        <X className="size-4" />
      </button>
    </div>
  );
}
