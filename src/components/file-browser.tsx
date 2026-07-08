"use client";

import {
  ChevronRight,
  Download,
  File as FileIcon,
  FolderClosed,
  FolderPlus,
  Home,
  Pencil,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "@/components/modal";
import { ShareDialog, type ShareTarget } from "@/components/share-dialog";
import { Button } from "@/components/ui/button";
import { fileChip, FOLDER_CHIP } from "@/lib/file-icons";
import { formatBytes, formatDate } from "@/lib/format";
import { uploadFile } from "@/lib/upload/chunked-uploader";

interface FolderEntry {
  id: string;
  name: string;
  createdAt: string;
  storageBackendId: string | null;
}
interface FileEntry {
  id: string;
  name: string;
  sizeBytes: string;
  mimeType: string;
  createdAt: string;
}
interface TreeData {
  folder: { id: string; name: string } | null;
  breadcrumbs: { id: string; name: string }[];
  folders: FolderEntry[];
  files: FileEntry[];
  quota: { usedBytes: string; quotaBytes: string };
  backends: { id: string; name: string; type: string; isDefault: boolean }[];
}

type Selected = { kind: "folder" | "file"; id: string };

interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

const inputClass =
  "border-input bg-card w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary/60";

export function FileBrowser({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const [data, setData] = useState<TreeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; item: Selected } | null>(null);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderBackend, setNewFolderBackend] = useState("");

  const [renaming, setRenaming] = useState<Selected | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "folder" | "file"; id: string; name: string } | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

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
    setSelected(null);
    void refresh();
  }, [refresh]);

  // Close context menu on any outside click / scroll / escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const filteredFolders = useMemo(
    () =>
      (data?.folders ?? []).filter((f) =>
        f.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [data, query],
  );
  const filteredFiles = useMemo(
    () =>
      (data?.files ?? []).filter((f) =>
        f.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [data, query],
  );

  const selectedFolder =
    selected?.kind === "folder"
      ? data?.folders.find((f) => f.id === selected.id) ?? null
      : null;
  const selectedFile =
    selected?.kind === "file"
      ? data?.files.find((f) => f.id === selected.id) ?? null
      : null;

  // ---------- uploads ----------
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const uid = crypto.randomUUID();
        setUploads((u) => [...u, { id: uid, name: file.name, progress: 0, status: "uploading" }]);
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
          setUploads((u) => u.map((it) => (it.id === uid ? { ...it, progress: 1, status: "done" } : it)));
        } catch (e) {
          setUploads((u) =>
            u.map((it) => (it.id === uid ? { ...it, status: "error", error: (e as Error).message } : it)),
          );
        }
      }
      await refresh();
      router.refresh();
      // Clear finished items after a moment.
      setTimeout(() => setUploads((u) => u.filter((it) => it.status === "uploading")), 2500);
    },
    [folderId, refresh, router],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  }

  // ---------- actions ----------
  async function createFolder() {
    setBusy(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName, parentId: folderId, storageBackendId: newFolderBackend || null }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Failed to create folder");
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
      if (!res.ok) throw new Error((await res.json()).message ?? "Rename failed");
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
      const res = await fetch(`/api/${path}/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).message ?? "Delete failed");
      setDeleteTarget(null);
      setSelected(null);
      await refresh();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function navigate(id: string | null) {
    setSelected(null);
    router.push(id ? `/dashboard/${id}` : "/dashboard");
  }

  function openContextMenu(e: React.MouseEvent, item: Selected) {
    e.preventDefault();
    e.stopPropagation();
    setSelected(item);
    const w = 190;
    const x = Math.min(e.clientX, window.innerWidth - w - 8);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    setMenu({ x, y, item });
  }

  const isEmpty = data && filteredFolders.length === 0 && filteredFiles.length === 0;
  const totalItems = (data?.folders.length ?? 0) + (data?.files.length ?? 0);

  return (
    <div
      className="flex min-h-screen flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {/* Top bar */}
      <header className="bg-card border-border flex h-[66px] flex-none items-center gap-4 border-b px-5">
        <div className="bg-muted border-border flex w-full max-w-md items-center gap-2.5 rounded-lg border px-3 py-2">
          <Search className="text-muted-foreground size-[17px]" />
          <input
            className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
            placeholder="Search files and folders"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
          <FolderPlus className="size-4" /> New folder
        </Button>
        <Button onClick={() => fileInputRef.current?.click()}>
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
      </header>

      <div className="flex min-h-0 flex-1">
        {/* File area */}
        <div className="flex min-w-0 flex-1 flex-col px-6 pt-5">
          {/* Breadcrumb */}
          <nav className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[13px]">
            <button className="hover:text-foreground flex items-center gap-1" onClick={() => navigate(null)}>
              <Home className="size-4" /> Home
            </button>
            {data?.breadcrumbs.map((b, i) => {
              const last = i === data.breadcrumbs.length - 1;
              return (
                <span key={b.id} className="flex items-center gap-1.5">
                  <ChevronRight className="size-3.5 opacity-50" />
                  <button
                    className={last ? "text-foreground font-semibold" : "hover:text-foreground"}
                    onClick={() => navigate(b.id)}
                  >
                    {b.name}
                  </button>
                </span>
              );
            })}
          </nav>

          {/* Heading */}
          <div className="mb-4 flex items-baseline gap-3">
            <h1 className="text-[23px] font-bold tracking-tight">
              {data?.folder?.name ?? "My Files"}
            </h1>
            <span className="text-muted-foreground text-[13.5px]">{totalItems} items</span>
          </div>

          {/* Drop hint */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`text-muted-foreground mb-2 flex items-center gap-2.5 rounded-xl border border-dashed px-4 py-2.5 text-[13px] transition-colors ${
              dragging ? "border-primary bg-accent" : "border-border"
            }`}
          >
            <Upload className="size-4" />
            Drag files here to upload, or <span className="text-primary font-semibold">browse</span>
          </button>

          {error && (
            <p className="text-destructive mb-2 text-sm" role="alert">
              {error}
            </p>
          )}

          {/* Upload queue */}
          {uploads.length > 0 && (
            <div className="bg-card border-border mb-3 space-y-2 rounded-xl border p-3">
              {uploads.map((u) => (
                <div key={u.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="truncate">{u.name}</span>
                    <span className="text-muted-foreground ml-2 shrink-0 text-xs">
                      {u.status === "error" ? "Error" : u.status === "done" ? "Done" : `${Math.round(u.progress * 100)}%`}
                    </span>
                  </div>
                  <div className="bg-input mt-1 h-1.5 w-full overflow-hidden rounded-full">
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

          {/* Table header */}
          <div className="text-muted-foreground border-border grid grid-cols-[minmax(0,1fr)_140px_90px_88px] items-center gap-4 border-b px-4 pb-2 text-[11.5px] font-semibold uppercase tracking-wide">
            <span>Name</span>
            <span>Modified</span>
            <span className="text-right">Size</span>
            <span />
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto py-1.5">
            {isEmpty ? (
              <p className="text-muted-foreground p-10 text-center text-sm">
                {query ? "No matches." : "This folder is empty. Drag files here or use Upload."}
              </p>
            ) : (
              <>
                {filteredFolders.map((f) => {
                  const isSel = selected?.kind === "folder" && selected.id === f.id;
                  const isRenaming = renaming?.kind === "folder" && renaming.id === f.id;
                  return (
                    <Row
                      key={f.id}
                      selected={isSel}
                      onClick={() => setSelected({ kind: "folder", id: f.id })}
                      onDoubleClick={() => navigate(f.id)}
                      onContextMenu={(e) => openContextMenu(e, { kind: "folder", id: f.id })}
                      chip={<ChipBox chip={FOLDER_CHIP} folder />}
                      name={
                        isRenaming ? (
                          <RenameInline
                            value={renameValue}
                            setValue={setRenameValue}
                            onSubmit={submitRename}
                            onCancel={() => setRenaming(null)}
                            busy={busy}
                          />
                        ) : (
                          <button className="truncate text-left hover:underline" onClick={() => navigate(f.id)}>
                            {f.name}
                          </button>
                        )
                      }
                      modified={formatDate(f.createdAt)}
                      size="—"
                      actions={
                        <RowActions
                          onShare={() => setShareTarget({ kind: "folder", id: f.id, name: f.name })}
                          onRename={() => {
                            setRenaming({ kind: "folder", id: f.id });
                            setRenameValue(f.name);
                          }}
                          onDelete={() => setDeleteTarget({ kind: "folder", id: f.id, name: f.name })}
                        />
                      }
                    />
                  );
                })}
                {filteredFiles.map((f) => {
                  const isSel = selected?.kind === "file" && selected.id === f.id;
                  const isRenaming = renaming?.kind === "file" && renaming.id === f.id;
                  return (
                    <Row
                      key={f.id}
                      selected={isSel}
                      onClick={() => setSelected({ kind: "file", id: f.id })}
                      onContextMenu={(e) => openContextMenu(e, { kind: "file", id: f.id })}
                      chip={<ChipBox chip={fileChip(f.name)} />}
                      name={
                        isRenaming ? (
                          <RenameInline
                            value={renameValue}
                            setValue={setRenameValue}
                            onSubmit={submitRename}
                            onCancel={() => setRenaming(null)}
                            busy={busy}
                          />
                        ) : (
                          <span className="truncate">{f.name}</span>
                        )
                      }
                      modified={formatDate(f.createdAt)}
                      size={formatBytes(Number(f.sizeBytes))}
                      actions={
                        <RowActions
                          download={`/api/files/${f.id}/download`}
                          onShare={() => setShareTarget({ kind: "file", id: f.id, name: f.name })}
                          onRename={() => {
                            setRenaming({ kind: "file", id: f.id });
                            setRenameValue(f.name);
                          }}
                          onDelete={() => setDeleteTarget({ kind: "file", id: f.id, name: f.name })}
                        />
                      }
                    />
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Details panel */}
        {(selectedFolder || selectedFile) && (
          <aside className="bg-card border-border hidden w-[320px] flex-none flex-col border-l p-5 lg:flex">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-muted-foreground text-[13px] font-semibold uppercase tracking-wide">
                Details
              </span>
              <button className="hover:bg-secondary rounded-md p-1.5" onClick={() => setSelected(null)} aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            <div className="border-border flex flex-col items-center border-b pb-5 text-center">
              <div
                className="flex size-[68px] items-center justify-center rounded-2xl"
                style={{ background: (selectedFolder ? FOLDER_CHIP : fileChip(selectedFile!.name)).bg }}
              >
                {selectedFolder ? (
                  <FolderClosed className="size-8" style={{ color: FOLDER_CHIP.color }} />
                ) : (
                  <span className="text-base font-bold" style={{ color: fileChip(selectedFile!.name).color }}>
                    {fileChip(selectedFile!.name).label}
                  </span>
                )}
              </div>
              <div className="mt-4 break-all text-[15px] font-bold">
                {selectedFolder?.name ?? selectedFile?.name}
              </div>
              <div className="text-muted-foreground mt-1 text-[13px]">
                {selectedFolder ? "Folder" : selectedFile!.mimeType}
              </div>
            </div>

            <div className="border-border flex flex-col gap-3 border-b py-5 text-[13.5px]">
              <Detail label="Size" value={selectedFolder ? "—" : formatBytes(Number(selectedFile!.sizeBytes))} />
              <Detail
                label="Modified"
                value={formatDate((selectedFolder?.createdAt ?? selectedFile!.createdAt))}
              />
              <Detail label="Kind" value={selectedFolder ? "Folder" : "File"} />
            </div>

            <div className="flex-1" />

            <div className="flex gap-2.5">
              {selectedFile ? (
                <a
                  href={`/api/files/${selectedFile.id}/download`}
                  className="bg-secondary hover:bg-secondary/70 text-foreground flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-[13.5px] font-semibold"
                >
                  <Download className="size-4" /> Download
                </a>
              ) : (
                <button
                  onClick={() => navigate(selectedFolder!.id)}
                  className="bg-secondary hover:bg-secondary/70 text-foreground flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-[13.5px] font-semibold"
                >
                  <FolderClosed className="size-4" /> Open
                </button>
              )}
              <button
                onClick={() =>
                  setShareTarget(
                    selectedFolder
                      ? { kind: "folder", id: selectedFolder.id, name: selectedFolder.name }
                      : { kind: "file", id: selectedFile!.id, name: selectedFile!.name },
                  )
                }
                className="bg-primary hover:bg-primary/90 text-primary-foreground flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-[13.5px] font-semibold"
              >
                <Share2 className="size-4" /> Share
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Context menu */}
      {menu && (
        <div
          className="bg-popover border-border fixed z-50 w-[190px] rounded-xl border p-1.5 shadow-lg"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.item.kind === "folder" && (
            <MenuItem icon={FolderClosed} label="Open" onClick={() => { navigate(menu.item.id); setMenu(null); }} />
          )}
          {menu.item.kind === "file" && (
            <a
              href={`/api/files/${menu.item.id}/download`}
              className="hover:bg-secondary flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px]"
              onClick={() => setMenu(null)}
            >
              <Download className="size-[15px]" /> Download
            </a>
          )}
          <MenuItem
            icon={Share2}
            label="Share"
            onClick={() => {
              const it = data && (menu.item.kind === "folder"
                ? data.folders.find((f) => f.id === menu.item.id)
                : data.files.find((f) => f.id === menu.item.id));
              if (it) setShareTarget({ kind: menu.item.kind, id: it.id, name: it.name });
              setMenu(null);
            }}
          />
          <MenuItem
            icon={Pencil}
            label="Rename"
            onClick={() => {
              const it = data && (menu.item.kind === "folder"
                ? data.folders.find((f) => f.id === menu.item.id)
                : data.files.find((f) => f.id === menu.item.id));
              if (it) {
                setRenaming(menu.item);
                setRenameValue(it.name);
              }
              setMenu(null);
            }}
          />
          <div className="bg-border mx-1.5 my-1 h-px" />
          <MenuItem
            icon={Trash2}
            label="Delete"
            destructive
            onClick={() => {
              const it = data && (menu.item.kind === "folder"
                ? data.folders.find((f) => f.id === menu.item.id)
                : data.files.find((f) => f.id === menu.item.id));
              if (it) setDeleteTarget({ kind: menu.item.kind, id: it.id, name: it.name });
              setMenu(null);
            }}
          />
        </div>
      )}

      {/* New folder modal */}
      <Modal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} title="New folder">
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
              <select className={inputClass} value={newFolderBackend} onChange={(e) => setNewFolderBackend(e.target.value)}>
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
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button disabled={busy || !newFolderName.trim()} onClick={() => void createFolder()}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Share dialog */}
      <ShareDialog target={shareTarget} onClose={() => setShareTarget(null)} />

      {/* Delete confirm */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title={`Delete ${deleteTarget?.kind ?? ""}`}>
        <p className="text-muted-foreground mb-4 text-sm">
          Delete <strong className="text-foreground">{deleteTarget?.name}</strong>
          {deleteTarget?.kind === "folder" ? " and everything inside it? " : "? "}
          This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void confirmDelete()}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}

function Row({
  selected,
  onClick,
  onDoubleClick,
  onContextMenu,
  chip,
  name,
  modified,
  size,
  actions,
}: {
  selected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  chip: React.ReactNode;
  name: React.ReactNode;
  modified: string;
  size: string;
  actions: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={`group grid grid-cols-[minmax(0,1fr)_140px_90px_88px] items-center gap-4 rounded-lg px-4 py-2.5 ${
        selected ? "bg-accent ring-accent-foreground/20 ring-1" : "hover:bg-secondary"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {chip}
        <div className="min-w-0 flex-1 text-sm font-medium">{name}</div>
      </div>
      <div className="text-muted-foreground text-[13.5px]">{modified}</div>
      <div className="text-muted-foreground text-right text-[13.5px]">{size}</div>
      <div className="flex justify-end">{actions}</div>
    </div>
  );
}

function ChipBox({ chip, folder }: { chip: { bg: string; color: string; label?: string }; folder?: boolean }) {
  return (
    <div className="flex size-[38px] flex-none items-center justify-center rounded-[10px]" style={{ background: chip.bg }}>
      {folder ? (
        <FolderClosed className="size-[19px]" style={{ color: chip.color }} />
      ) : (
        <span className="text-[10px] font-bold tracking-wide" style={{ color: chip.color }}>
          {chip.label}
        </span>
      )}
    </div>
  );
}

function RowActions({
  download,
  onShare,
  onRename,
  onDelete,
}: {
  download?: string;
  onShare: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      {download && (
        <a href={download} onClick={(e) => e.stopPropagation()} className="hover:bg-background rounded-md p-1.5" aria-label="Download">
          <Download className="size-4" />
        </a>
      )}
      <button className="hover:bg-background rounded-md p-1.5" onClick={stop(onShare)} aria-label="Share">
        <Share2 className="size-4" />
      </button>
      <button className="hover:bg-background rounded-md p-1.5" onClick={stop(onRename)} aria-label="Rename">
        <Pencil className="size-4" />
      </button>
      <button className="hover:bg-background text-destructive rounded-md p-1.5" onClick={stop(onDelete)} aria-label="Delete">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] ${
        destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-secondary"
      }`}
    >
      <Icon className="size-[15px]" /> {label}
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
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
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        className="border-input bg-card w-full rounded-md border px-2 py-1 text-sm outline-none"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <Button size="sm" disabled={busy} onClick={onSubmit}>Save</Button>
      <button className="hover:bg-background rounded-md p-1.5" onClick={onCancel} aria-label="Cancel">
        <X className="size-4" />
      </button>
    </div>
  );
}
