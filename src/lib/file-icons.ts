// File-type chip styling (matches the Nimbus design). Maps a file extension to a
// light background + accent color + short label. Folders use the blue accent.

export interface Chip {
  bg: string;
  color: string;
  label: string;
}

const EXT_COLORS: Record<string, { bg: string; color: string }> = {
  pdf: { bg: "#fdecec", color: "#e5484d" },
  fig: { bg: "#f1ecfd", color: "#8b5cf6" },
  xlsx: { bg: "#e7f6ec", color: "#16a34a" },
  xls: { bg: "#e7f6ec", color: "#16a34a" },
  csv: { bg: "#e7f6ec", color: "#16a34a" },
  mp4: { bg: "#fdefe4", color: "#ea7a3c" },
  mov: { bg: "#fdefe4", color: "#ea7a3c" },
  mkv: { bg: "#fdefe4", color: "#ea7a3c" },
  webm: { bg: "#fdefe4", color: "#ea7a3c" },
  avi: { bg: "#fdefe4", color: "#ea7a3c" },
  mp3: { bg: "#fdefe4", color: "#ea7a3c" },
  wav: { bg: "#fdefe4", color: "#ea7a3c" },
  png: { bg: "#e9f0fc", color: "#2f6bd6" },
  jpg: { bg: "#e9f0fc", color: "#2f6bd6" },
  jpeg: { bg: "#e9f0fc", color: "#2f6bd6" },
  gif: { bg: "#e9f0fc", color: "#2f6bd6" },
  webp: { bg: "#e9f0fc", color: "#2f6bd6" },
  svg: { bg: "#e9f0fc", color: "#2f6bd6" },
  docx: { bg: "#e9f0fc", color: "#2563eb" },
  doc: { bg: "#e9f0fc", color: "#2563eb" },
  txt: { bg: "#eef1f4", color: "#6b7686" },
  md: { bg: "#eef1f4", color: "#6b7686" },
  zip: { bg: "#f3eede", color: "#a97c2f" },
  tar: { bg: "#f3eede", color: "#a97c2f" },
  gz: { bg: "#f3eede", color: "#a97c2f" },
};

const DEFAULT = { bg: "#eef1f4", color: "#6b7686" };
export const FOLDER_CHIP = { bg: "#e9f0fc", color: "#2f6bd6" };

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function fileChip(name: string): Chip {
  const ext = extensionOf(name);
  const c = EXT_COLORS[ext] ?? DEFAULT;
  return { bg: c.bg, color: c.color, label: (ext || "•").toUpperCase() };
}
