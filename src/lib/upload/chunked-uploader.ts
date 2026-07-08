// Client-side chunked uploader (system-prompt §5.1). Slices the file into
// sequential chunks, PUTs each (with retry + resume), then completes.
// Used by the file browser UI (Phase 6). Runs in the browser.

export interface UploadProgress {
  fileId: string;
  uploadedBytes: number;
  totalBytes: number;
  chunkIndex: number;
  totalChunks: number;
}

export interface UploadOptions {
  file: File;
  folderId?: string | null;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
  maxRetriesPerChunk?: number;
}

export interface UploadResult {
  fileId: string;
  sizeBytes: string;
}

interface InitResponse {
  uploadSessionId: string;
  fileId: string;
  chunkSizeBytes: number;
  totalChunks: number;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.message ?? body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadFile(opts: UploadOptions): Promise<UploadResult> {
  const { file, folderId = null, onProgress, signal } = opts;
  const maxRetries = opts.maxRetriesPerChunk ?? 3;

  // 1. Init.
  const initRes = await fetch("/api/upload/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
      folderId,
    }),
    signal,
  });
  if (!initRes.ok) throw new Error(await readError(initRes));
  const init = (await initRes.json()) as InitResponse;
  const { uploadSessionId, fileId, chunkSizeBytes, totalChunks } = init;

  // 2. Resume point: ask the server how far it got.
  let nextIndex = 0;
  const statusRes = await fetch(`/api/upload/${uploadSessionId}`, { signal });
  if (statusRes.ok) {
    const status = (await statusRes.json()) as { nextChunkIndex: number };
    nextIndex = status.nextChunkIndex;
  }

  // 3. Upload chunks sequentially.
  for (let i = nextIndex; i < totalChunks; i++) {
    const start = i * chunkSizeBytes;
    const end = Math.min(start + chunkSizeBytes, file.size);
    const blob = file.slice(start, end);

    let attempt = 0;
    for (;;) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const res = await fetch(
        `/api/upload/chunk?sessionId=${encodeURIComponent(uploadSessionId)}&index=${i}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
          signal,
        },
      );

      if (res.ok) break;

      // Server already advanced past this index — resync and continue.
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as {
          expected?: number;
        };
        if (typeof body.expected === "number") {
          i = body.expected - 1; // for-loop ++ moves to `expected`
          break;
        }
      }

      attempt += 1;
      if (attempt > maxRetries) throw new Error(await readError(res));
      await sleep(2 ** attempt * 250); // exponential backoff
    }

    onProgress?.({
      fileId,
      uploadedBytes: end,
      totalBytes: file.size,
      chunkIndex: i,
      totalChunks,
    });
  }

  // 4. Complete.
  const completeRes = await fetch("/api/upload/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: uploadSessionId }),
    signal,
  });
  if (!completeRes.ok) throw new Error(await readError(completeRes));
  const done = (await completeRes.json()) as {
    fileId: string;
    sizeBytes: string;
  };
  return { fileId: done.fileId, sizeBytes: done.sizeBytes };
}
