// S3-compatible storage driver (system-prompt §4). Works with AWS S3, MinIO
// (forcePathStyle), Hetzner, etc. Uses multipart upload so 50 MiB chunks map to
// parts (PartNumber = chunkIndex + 1); download uses ranged GetObject.
import type { Readable } from "node:stream";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";

import type {
  CompleteUploadParams,
  InitUploadResult,
  ReadRangeParams,
  StorageDriver,
  WriteChunkParams,
  WriteChunkResult,
} from "./driver";

export interface S3BackendConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export class S3StorageDriver implements StorageDriver {
  readonly type = "S3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3BackendConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async initUpload(
    key: string,
    _totalSize: number,
    mimeType: string,
  ): Promise<InitUploadResult> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
      }),
    );
    if (!res.UploadId) {
      throw new Error(`S3 CreateMultipartUpload returned no UploadId for ${key}`);
    }
    return { externalUploadId: res.UploadId };
  }

  async writeChunk(params: WriteChunkParams): Promise<WriteChunkResult> {
    const { key, chunkIndex, chunkStream, chunkLength, externalUploadId } =
      params;
    if (!externalUploadId) {
      throw new Error("S3 writeChunk requires externalUploadId");
    }
    const res = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: externalUploadId,
        PartNumber: chunkIndex + 1,
        Body: chunkStream,
        // ContentLength is mandatory for streamed (non-buffered) part bodies.
        ContentLength: chunkLength,
      }),
    );
    if (!res.ETag) {
      throw new Error(`S3 UploadPart returned no ETag for ${key} part ${chunkIndex + 1}`);
    }
    return { eTag: res.ETag };
  }

  async completeUpload(params: CompleteUploadParams): Promise<void> {
    const { key, externalUploadId, parts } = params;
    if (!externalUploadId) {
      throw new Error("S3 completeUpload requires externalUploadId");
    }
    const sorted = [...(parts ?? [])].sort((a, b) => a.partNumber - b.partNumber);
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: externalUploadId,
        MultipartUpload: {
          Parts: sorted.map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.eTag,
          })),
        },
      }),
    );
  }

  async abortUpload(key: string, externalUploadId?: string): Promise<void> {
    if (!externalUploadId) return;
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: externalUploadId,
      }),
    );
  }

  async readRange(params: ReadRangeParams): Promise<Readable> {
    const { key, start, end } = params;
    let range: string | undefined;
    if (start !== undefined) {
      range = `bytes=${start}-${end !== undefined ? end : ""}`;
    } else if (end !== undefined) {
      // suffix range: last `end` bytes
      range = `bytes=-${end}`;
    }
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range,
      }),
    );
    if (!res.Body) {
      throw new Error(`S3 GetObject returned no Body for ${key}`);
    }
    // In the Node.js runtime the SDK streams the body as a Readable.
    return res.Body as Readable;
  }

  async stat(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { sizeBytes: res.ContentLength ?? 0 };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}

export function createS3StorageDriver(config: S3BackendConfig): S3StorageDriver {
  return new S3StorageDriver(config);
}
