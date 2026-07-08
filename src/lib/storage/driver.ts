// Storage driver interface (system-prompt §4). The core app never touches the
// filesystem or S3 directly — all physical I/O goes through this interface.
// Everything is streaming: no route or driver may buffer a whole file in RAM.
import type { Readable } from "node:stream";

export interface InitUploadResult {
  /** S3 multipart uploadId; undefined for local driver */
  externalUploadId?: string;
}

export interface WriteChunkParams {
  key: string;
  chunkIndex: number; // 0-based, strictly sequential
  chunkStream: Readable; // raw request body — MUST be streamed, never buffered
  chunkLength: number; // from Content-Length, validated
  externalUploadId?: string; // S3 only
}

export interface WriteChunkResult {
  /** S3 part ETag; undefined for local driver */
  eTag?: string;
}

export interface CompleteUploadParams {
  key: string;
  externalUploadId?: string;
  parts?: { partNumber: number; eTag: string }[]; // S3 only
}

export interface ReadRangeParams {
  key: string;
  /** inclusive byte offsets; omit for full-file stream */
  start?: number;
  end?: number;
}

export interface StorageDriver {
  readonly type: "LOCAL" | "S3";
  initUpload(
    key: string,
    totalSize: number,
    mimeType: string,
  ): Promise<InitUploadResult>;
  writeChunk(params: WriteChunkParams): Promise<WriteChunkResult>;
  completeUpload(params: CompleteUploadParams): Promise<void>;
  abortUpload(key: string, externalUploadId?: string): Promise<void>;
  /** Returns a Node Readable limited to [start, end] when provided */
  readRange(params: ReadRangeParams): Promise<Readable>;
  stat(key: string): Promise<{ sizeBytes: number } | null>;
  delete(key: string): Promise<void>;
}
