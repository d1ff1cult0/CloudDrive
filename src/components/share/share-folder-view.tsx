"use client";

import { ChevronRight, Download, FolderClosed } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Brand } from "@/components/brand";
import { fileChip, FOLDER_CHIP } from "@/lib/file-icons";
import { formatBytes } from "@/lib/format";

interface Contents {
  type: "folder";
  rootId: string;
  rootName: string;
  current: { id: string; name: string } | null;
  breadcrumbs: { id: string; name: string }[];
  folders: { id: string; name: string }[];
  files: { id: string; name: string; sizeBytes: string; mimeType: string }[];
}

export function ShareFolderView({
  token,
  initial,
}: {
  token: string;
  initial: Contents;
}) {
  const [data, setData] = useState<Contents>(initial);
  const [folderId, setFolderId] = useState<string>(initial.rootId);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (id: string) => {
      setError(null);
      const res = await fetch(`/api/share/${token}?folderId=${encodeURIComponent(id)}`);
      if (!res.ok) {
        setError("Could not open folder");
        return;
      }
      setData(await res.json());
    },
    [token],
  );

  useEffect(() => {
    if (folderId !== initial.rootId) void load(folderId);
    else setData(initial);
  }, [folderId, initial, load]);

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-card border-border flex h-[60px] items-center border-b px-6">
        <Brand />
      </header>
      <div className="mx-auto w-full max-w-3xl p-6">
        <h1 className="text-xl font-bold tracking-tight">{data.rootName}</h1>
        <p className="text-muted-foreground mb-4 text-sm">Shared folder · read-only</p>

        <nav className="text-muted-foreground mb-3 flex flex-wrap items-center gap-1.5 text-[13px]">
          <button className="hover:text-foreground" onClick={() => setFolderId(data.rootId)}>
            {data.rootName}
          </button>
          {data.breadcrumbs
            .filter((b) => b.id !== data.rootId)
            .map((b) => (
              <span key={b.id} className="flex items-center gap-1.5">
                <ChevronRight className="size-3.5 opacity-50" />
                <button className="hover:text-foreground" onClick={() => setFolderId(b.id)}>
                  {b.name}
                </button>
              </span>
            ))}
        </nav>

        {error && <p className="text-destructive mb-3 text-sm">{error}</p>}

        <div className="bg-card border-border rounded-xl border p-1.5">
          {data.folders.length === 0 && data.files.length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-sm">This folder is empty.</p>
          ) : (
            <ul>
              {data.folders.map((f) => (
                <li key={f.id} className="hover:bg-secondary flex items-center gap-3 rounded-lg px-3 py-2.5">
                  <div
                    className="flex size-9 flex-none items-center justify-center rounded-[10px]"
                    style={{ background: FOLDER_CHIP.bg }}
                  >
                    <FolderClosed className="size-[18px]" style={{ color: FOLDER_CHIP.color }} />
                  </div>
                  <button
                    className="flex-1 truncate text-left text-sm font-medium hover:underline"
                    onClick={() => setFolderId(f.id)}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
              {data.files.map((f) => {
                const chip = fileChip(f.name);
                return (
                  <li key={f.id} className="group hover:bg-secondary flex items-center gap-3 rounded-lg px-3 py-2.5">
                    <div
                      className="flex size-9 flex-none items-center justify-center rounded-[10px]"
                      style={{ background: chip.bg }}
                    >
                      <span className="text-[10px] font-bold" style={{ color: chip.color }}>
                        {chip.label}
                      </span>
                    </div>
                    <span className="flex-1 truncate text-sm font-medium">{f.name}</span>
                    <span className="text-muted-foreground hidden w-20 shrink-0 text-right text-xs sm:block">
                      {formatBytes(Number(f.sizeBytes))}
                    </span>
                    <a
                      href={`/api/share/${token}/download?fileId=${f.id}`}
                      className="hover:bg-background rounded-md p-1.5"
                      aria-label="Download"
                    >
                      <Download className="size-4" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
