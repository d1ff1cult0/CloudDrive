// HTTP Range parsing (system-prompt §5.2). Pure, dependency-free so it can be
// unit-tested in isolation. Consumed by serve-file.ts.

export interface ParsedRange {
  start: number;
  end: number; // inclusive
}

/**
 * Parse a Range header against totalSize.
 *   null            → no/ignored Range (serve full 200)
 *   "unsatisfiable" → respond 416
 *   ParsedRange     → serve 206 [start, end]
 * Handles "bytes=start-end", "bytes=start-", and suffix "bytes=-N".
 */
export function parseRange(
  header: string | null,
  totalSize: number,
): ParsedRange | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(.*)$/.exec(header.trim());
  if (!m) return null; // not a byte range → ignore, full response

  // Only the first range is honored (we don't emit multipart/byteranges).
  const spec = m[1].split(",")[0]?.trim() ?? "";
  const dash = spec.indexOf("-");
  if (dash === -1) return "unsatisfiable";

  const startStr = spec.slice(0, dash).trim();
  const endStr = spec.slice(dash + 1).trim();

  let start: number;
  let end: number;

  if (startStr === "") {
    // suffix range: last N bytes
    const n = Number(endStr);
    if (endStr === "" || !Number.isInteger(n) || n <= 0) return "unsatisfiable";
    if (totalSize === 0) return "unsatisfiable";
    start = Math.max(0, totalSize - n);
    end = totalSize - 1;
  } else {
    start = Number(startStr);
    if (!Number.isInteger(start) || start < 0) return "unsatisfiable";
    if (endStr === "") {
      end = totalSize - 1;
    } else {
      end = Number(endStr);
      if (!Number.isInteger(end) || end < 0) return "unsatisfiable";
    }
    end = Math.min(end, totalSize - 1); // clamp
  }

  if (start >= totalSize || start > end) return "unsatisfiable";
  return { start, end };
}
