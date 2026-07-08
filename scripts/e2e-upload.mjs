// Phase 3 end-to-end test: upload a ~120 MiB file in 50 MiB chunks over HTTP,
// then verify the out-of-order guard. Run against a dev server on :3033.
//   node scripts/e2e-upload.mjs
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3033";
const CHUNK = 52_428_800; // 50 MiB
const SIZE = 120 * 1024 * 1024; // 120 MiB

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function genFile() {
  const p = path.join(os.tmpdir(), `vault-e2e-${Date.now()}.bin`);
  const ws = fs.createWriteStream(p);
  const hash = createHash("sha256");
  let written = 0;
  while (written < SIZE) {
    const n = Math.min(1024 * 1024, SIZE - written);
    const buf = randomBytes(n);
    hash.update(buf);
    await new Promise((res, rej) => ws.write(buf, (e) => (e ? rej(e) : res())));
    written += n;
  }
  await new Promise((res) => ws.end(res));
  return { path: p, sha256: hash.digest("hex") };
}

async function main() {
  console.log(`Generating ${SIZE} byte test file…`);
  const src = await genFile();
  console.log(`  sha256 = ${src.sha256}`);

  // 1. init
  const initRes = await fetch(`${BASE}/api/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: "e2e-movie.bin",
      sizeBytes: SIZE,
      mimeType: "application/octet-stream",
      folderId: null,
    }),
  });
  if (!initRes.ok) fail(`init failed: ${initRes.status} ${await initRes.text()}`);
  const init = await initRes.json();
  console.log(`init → session=${init.uploadSessionId} file=${init.fileId} chunks=${init.totalChunks}`);
  if (init.chunkSizeBytes !== CHUNK) fail(`unexpected chunkSizeBytes ${init.chunkSizeBytes}`);

  // 2. chunks
  const fh = await fsp.open(src.path, "r");
  for (let i = 0; i < init.totalChunks; i++) {
    const start = i * CHUNK;
    const len = Math.min(CHUNK, SIZE - start);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, start);
    const res = await fetch(
      `${BASE}/api/upload/chunk?sessionId=${init.uploadSessionId}&index=${i}`,
      { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: buf },
    );
    if (!res.ok) fail(`chunk ${i} failed: ${res.status} ${await res.text()}`);
    const j = await res.json();
    if (j.next !== i + 1) fail(`chunk ${i} bad next: ${JSON.stringify(j)}`);
    process.stdout.write(`  chunk ${i} ok (${len} bytes)\n`);
  }
  await fh.close();

  // 3. complete
  const compRes = await fetch(`${BASE}/api/upload/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: init.uploadSessionId }),
  });
  if (!compRes.ok) fail(`complete failed: ${compRes.status} ${await compRes.text()}`);
  const comp = await compRes.json();
  console.log(`complete → ${JSON.stringify(comp)}`);
  if (comp.status !== "READY") fail(`expected READY, got ${comp.status}`);
  if (String(comp.sizeBytes) !== String(SIZE)) fail(`size mismatch ${comp.sizeBytes}`);

  // 4. out-of-order guard: new session, PUT wrong index → 409
  const init2 = await (
    await fetch(`${BASE}/api/upload/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "ooo.bin", sizeBytes: 1024, mimeType: "application/octet-stream", folderId: null }),
    })
  ).json();
  const oooRes = await fetch(
    `${BASE}/api/upload/chunk?sessionId=${init2.uploadSessionId}&index=5`,
    { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: Buffer.alloc(1024) },
  );
  const oooBody = await oooRes.json();
  console.log(`out-of-order → HTTP ${oooRes.status} ${JSON.stringify(oooBody)}`);
  if (oooRes.status !== 409) fail(`expected 409, got ${oooRes.status}`);
  if (oooBody.error !== "OUT_OF_ORDER" || oooBody.expected !== 0)
    fail(`unexpected 409 body: ${JSON.stringify(oooBody)}`);
  // clean up the throwaway session
  await fetch(`${BASE}/api/upload/${init2.uploadSessionId}`, { method: "DELETE" });

  await fsp.unlink(src.path).catch(() => {});

  // Emit machine-readable result for the shell verifier.
  console.log(
    "RESULT " +
      JSON.stringify({ fileId: comp.fileId, sha256: src.sha256, sizeBytes: SIZE }),
  );
}

main().catch((e) => fail(e?.stack ?? String(e)));
