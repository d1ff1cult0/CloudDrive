"use client";

import {
  ChevronRight,
  Download,
  File as FileIcon,
  Folder as FolderIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
    <div className="mx-auto w-full max-w-3xl p-6">
      <h1 className="mb-1 text-xl font-semibold">{data.rootName}</h1>
      <p className="text-muted-foreground mb-4 text-sm">Shared folder (read-only)</p>

      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button
          className="hover:text-foreground text-muted-foreground"
          onClick={() => setFolderId(data.rootId)}
        >
          {data.rootName}
        </button>
        {data.breadcrumbs
          .filter((b) => b.id !== data.rootId)
          .map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight className="text-muted-foreground size-3" />
              <button
                className="hover:text-foreground text-muted-foreground"
                onClick={() => setFolderId(b.id)}
              >
                {b.name}
              </button>
            </span>
          ))}
      </nav>

      {error && <p className="text-destructive mb-3 text-sm">{error}</p>}

      <div className="rounded-lg border">
        {data.folders.length === 0 && data.files.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            This folder is empty.
          </p>
        ) : (
          <ul className="divide-y">
            {data.folders.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                <FolderIcon className="size-5 shrink-0 text-sky-500" />
                <button
                  className="flex-1 truncate text-left text-sm hover:underline"
                  onClick={() => setFolderId(f.id)}
                >
                  {f.name}
                </button>
              </li>
            ))}
            {data.files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileIcon className="text-muted-foreground size-5 shrink-0" />
                <span className="flex-1 truncate text-sm">{f.name}</span>
                <span className="text-muted-foreground hidden w-20 shrink-0 text-right text-xs sm:block">
                  {formatBytes(Number(f.sizeBytes))}
                </span>
                <a
                  href={`/api/share/${token}/download?fileId=${f.id}`}
                  className="hover:bg-muted rounded p-1.5"
                  aria-label="Download"
                >
                  <Download className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
