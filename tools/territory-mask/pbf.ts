/**
 * A minimal OpenStreetMap PBF reader: build tooling only, no dependencies. It reads the file block by block, inflates
 * blocks in parallel on the libuv thread pool, and hands back nodes, ways and their tags in file order.
 * Relations are skipped. Format: https://wiki.openstreetmap.org/wiki/PBF_Format
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { inflate } from "node:zlib";

/* ---------- protobuf primitives ---------- */

/** Cursor over a Buffer. Varints are read as plain numbers, exact up to 2^53 (OSM ids and coordinates fit). */
export class Cur {
  pos: number;
  constructor(readonly buf: Buffer, pos = 0, readonly end = buf.length) {
    this.pos = pos;
  }
  get done(): boolean {
    return this.pos >= this.end;
  }
  varint(): number {
    const b = this.buf;
    let byte = b[this.pos++];
    if (byte < 0x80) return byte;
    let result = byte & 0x7f;
    let mul = 128;
    for (;;) {
      byte = b[this.pos++];
      result += (byte & 0x7f) * mul;
      if (byte < 0x80) return result;
      mul *= 128;
      if (mul > 2 ** 70) throw new Error("varint too long");
    }
  }
  /** Zig-zag decoded signed varint. */
  svarint(): number {
    const n = this.varint();
    return n % 2 === 1 ? -(n + 1) / 2 : n / 2;
  }
  bytes(): Buffer {
    const len = this.varint();
    const out = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }
  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) {
      const len = this.varint(); // read first: `this.pos += this.varint()` would discard the varint's own bytes
      this.pos += len;
    }
    else if (wire === 5) this.pos += 4;
    else throw new Error(`unsupported wire type ${wire}`);
  }
}

const packedVarints = (buf: Buffer): number[] => {
  const c = new Cur(buf);
  const out: number[] = [];
  while (!c.done) out.push(c.varint());
  return out;
};

/* ---------- decoded shapes ---------- */

export interface PbfHeader {
  requiredFeatures: string[];
  writingProgram?: string;
  /** Replication timestamp, epoch seconds: the moment the data reflects. */
  replicationTimestamp?: number;
  replicationSequence?: number;
}

export interface NodeVisitor {
  /** Called for every node in file order. */
  node(id: number, lat: number, lon: number): void;
  /**
   * Called for every way with its raw, still-encoded parts, so a caller that rejects most ways pays almost nothing for them.
   * Decode with `refsOf` and `tagsOf` only for the ways it keeps.
   */
  way(id: number, refs: Buffer | null, keys: Buffer | null, vals: Buffer | null, strings: Buffer[]): void;
}

/** Node ids of a way (delta coded in the file). */
export function refsOf(refs: Buffer | null): number[] {
  const out: number[] = [];
  if (refs) {
    const rc = new Cur(refs);
    let r = 0;
    while (!rc.done) out.push((r += rc.svarint()));
  }
  return out;
}

/** Calls `fn` for each node id of a way without building an array. */
export function eachRef(refs: Buffer | null, fn: (id: number) => boolean | void): void {
  if (!refs) return;
  const rc = new Cur(refs);
  let r = 0;
  while (!rc.done) if (fn((r += rc.svarint())) === true) return;
}

export function tagsOf(keys: Buffer | null, vals: Buffer | null, strings: Buffer[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!keys || !vals) return out;
  const k = packedVarints(keys);
  const v = packedVarints(vals);
  for (let i = 0; i < k.length; i++) out[strings[k[i]].toString("utf8")] = strings[v[i]].toString("utf8");
  return out;
}

/** Value of one tag, or undefined. */
export function tagOf(keys: Buffer | null, vals: Buffer | null, strings: Buffer[], key: string): string | undefined {
  if (!keys || !vals) return undefined;
  const kc = new Cur(keys);
  const vc = new Cur(vals);
  while (!kc.done) {
    const ki = kc.varint();
    const vi = vc.varint();
    if (strings[ki].length === key.length && strings[ki].toString("utf8") === key) return strings[vi].toString("utf8");
  }
  return undefined;
}

/* ---------- block decoding ---------- */

function decodeHeader(buf: Buffer): PbfHeader {
  const c = new Cur(buf);
  const h: PbfHeader = { requiredFeatures: [] };
  while (!c.done) {
    const tag = c.varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 4 && wire === 2) h.requiredFeatures.push(c.bytes().toString("utf8"));
    else if (field === 16 && wire === 2) h.writingProgram = c.bytes().toString("utf8");
    else if (field === 32 && wire === 0) h.replicationTimestamp = c.varint();
    else if (field === 33 && wire === 0) h.replicationSequence = c.varint();
    else c.skip(wire);
  }
  return h;
}

/** Decodes one OSMData block, calling the visitor for its nodes and ways. */
export function decodeBlock(buf: Buffer, v: NodeVisitor): void {
  const c = new Cur(buf);
  let strings: Buffer[] = [];
  let granularity = 100;
  let latOffset = 0;
  let lonOffset = 0;
  const groups: Buffer[] = [];
  while (!c.done) {
    const tag = c.varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 1 && wire === 2) {
      const st = new Cur(c.bytes());
      strings = [];
      while (!st.done) {
        const t = st.varint();
        if (t === 10) strings.push(st.bytes());
        else st.skip(t % 8);
      }
    } else if (field === 2 && wire === 2) groups.push(c.bytes());
    else if (field === 17 && wire === 0) granularity = c.varint();
    else if (field === 19 && wire === 0) latOffset = c.varint();
    else if (field === 20 && wire === 0) lonOffset = c.varint();
    else c.skip(wire);
  }
  const lat = (raw: number) => 1e-9 * (latOffset + granularity * raw);
  const lon = (raw: number) => 1e-9 * (lonOffset + granularity * raw);

  for (const g of groups) {
    const gc = new Cur(g);
    while (!gc.done) {
      const tag = gc.varint();
      const field = Math.floor(tag / 8);
      const wire = tag % 8;
      if (field === 2 && wire === 2) {
        // dense nodes: ids, latitudes and longitudes are delta coded; tags are not needed here
        const dc = new Cur(gc.bytes());
        let ids: Buffer | null = null;
        let lats: Buffer | null = null;
        let lons: Buffer | null = null;
        while (!dc.done) {
          const t = dc.varint();
          const f = Math.floor(t / 8);
          if (f === 1 && t % 8 === 2) ids = dc.bytes();
          else if (f === 8 && t % 8 === 2) lats = dc.bytes();
          else if (f === 9 && t % 8 === 2) lons = dc.bytes();
          else dc.skip(t % 8);
        }
        if (ids && lats && lons) {
          const ic = new Cur(ids);
          const ac = new Cur(lats);
          const oc = new Cur(lons);
          let id = 0;
          let la = 0;
          let lo = 0;
          while (!ic.done) {
            id += ic.svarint();
            la += ac.svarint();
            lo += oc.svarint();
            v.node(id, lat(la), lon(lo));
          }
        }
      } else if (field === 1 && wire === 2) {
        const nc = new Cur(gc.bytes());
        let id = 0;
        let la = 0;
        let lo = 0;
        while (!nc.done) {
          const t = nc.varint();
          const f = Math.floor(t / 8);
          if (f === 1 && t % 8 === 0) id = nc.svarint();
          else if (f === 8 && t % 8 === 0) la = nc.svarint();
          else if (f === 9 && t % 8 === 0) lo = nc.svarint();
          else nc.skip(t % 8);
        }
        v.node(id, lat(la), lon(lo));
      } else if (field === 3 && wire === 2) {
        const wc = new Cur(gc.bytes());
        let id = 0;
        let keys: Buffer | null = null;
        let vals: Buffer | null = null;
        let refs: Buffer | null = null;
        while (!wc.done) {
          const t = wc.varint();
          const f = Math.floor(t / 8);
          if (f === 1 && t % 8 === 0) id = wc.varint();
          else if (f === 2 && t % 8 === 2) keys = wc.bytes();
          else if (f === 3 && t % 8 === 2) vals = wc.bytes();
          else if (f === 8 && t % 8 === 2) refs = wc.bytes();
          else wc.skip(t % 8);
        }
        v.way(id, refs, keys, vals, strings);
      } else gc.skip(wire); // relations and changesets
    }
  }
}

/* ---------- byte source ---------- */

/** Bytes of a local file or an http(s) URL (through curl, so proxies work), resuming by byte offset after a dropped connection. */
export async function* byteChunks(source: string, onRetry?: (offset: number, attempt: number) => void): AsyncGenerator<Buffer> {
  if (!/^https?:\/\//.test(source)) {
    for await (const chunk of createReadStream(source, { highWaterMark: 1 << 22 })) yield chunk as Buffer;
    return;
  }
  let offset = 0;
  let failures = 0;
  for (;;) {
    const args = ["-sS", "--fail", "-L", "--connect-timeout", "30", "--speed-limit", "20000", "--speed-time", "60", ...(offset ? ["-r", `${offset}-`] : []), source];
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    const closed = new Promise<number>((res) => child.on("close", (code) => res(code ?? 1)));
    for await (const chunk of child.stdout) {
      offset += (chunk as Buffer).length;
      yield chunk as Buffer;
    }
    const code = await closed;
    if (code === 0) return;
    if (++failures > 30) throw new Error(`download failed after ${failures} attempts at byte ${offset}: ${stderr.trim()}`);
    onRetry?.(offset, failures);
    await new Promise((r) => setTimeout(r, Math.min(2000 * failures, 20000)));
  }
}

class Reader {
  private queue: Buffer[] = [];
  private queued = 0;
  private it: AsyncGenerator<Buffer>;
  consumed = 0;
  constructor(it: AsyncGenerator<Buffer>, private onBytes: (b: Buffer) => void) {
    this.it = it;
  }
  async exact(n: number): Promise<Buffer | null> {
    while (this.queued < n) {
      const { value, done } = await this.it.next();
      if (done) {
        if (this.queued === 0) return null;
        throw new Error("file ends in the middle of a block");
      }
      this.onBytes(value);
      this.queue.push(value);
      this.queued += value.length;
    }
    const all = this.queue.length === 1 ? this.queue[0] : Buffer.concat(this.queue);
    const out = all.subarray(0, n);
    const rest = all.subarray(n);
    this.queue = rest.length ? [rest] : [];
    this.queued = rest.length;
    this.consumed += n;
    return out;
  }
}

export interface ReadResult {
  header: PbfHeader;
  bytes: number;
  md5: string;
  sha256: string;
}

export interface ReadOptions {
  visitor: NodeVisitor;
  /** Called after each block with bytes read so far. */
  progress?: (bytes: number) => void;
  onRetry?: (offset: number, attempt: number) => void;
  /** Blocks inflated at once. */
  parallel?: number;
}

/** Reads the whole file in order, feeding the visitor, and returns the header and the file's checksums. */
export async function readPbf(source: string, opts: ReadOptions): Promise<ReadResult> {
  const md5 = createHash("md5");
  const sha256 = createHash("sha256");
  const reader = new Reader(byteChunks(source, opts.onRetry), (b) => {
    md5.update(b);
    sha256.update(b);
  });
  const parallel = opts.parallel ?? 8;
  let header: PbfHeader | null = null;
  const inflight: Promise<Buffer>[] = [];
  let sawData = false;

  const drainOne = async () => {
    const block = await (inflight.shift() as Promise<Buffer>);
    decodeBlock(block, opts.visitor);
    opts.progress?.(reader.consumed);
  };

  for (;;) {
    const lenBuf = await reader.exact(4);
    if (!lenBuf) break;
    const headerLen = lenBuf.readUInt32BE(0);
    if (headerLen > 64 * 1024) throw new Error("not a PBF file (bad block header)");
    const bh = new Cur((await reader.exact(headerLen)) as Buffer);
    let type = "";
    let dataSize = 0;
    while (!bh.done) {
      const t = bh.varint();
      const f = Math.floor(t / 8);
      if (f === 1 && t % 8 === 2) type = bh.bytes().toString("utf8");
      else if (f === 3 && t % 8 === 0) dataSize = bh.varint();
      else bh.skip(t % 8);
    }
    const blobBuf = (await reader.exact(dataSize)) as Buffer;
    const bc = new Cur(blobBuf);
    let raw: Buffer | null = null;
    let zlibData: Buffer | null = null;
    let other = false;
    while (!bc.done) {
      const t = bc.varint();
      const f = Math.floor(t / 8);
      if (f === 1 && t % 8 === 2) raw = bc.bytes();
      else if (f === 3 && t % 8 === 2) zlibData = bc.bytes();
      else if (f >= 4 && f <= 7 && t % 8 === 2) {
        other = true;
        bc.bytes();
      } else bc.skip(t % 8);
    }
    if (other) throw new Error("block uses an unsupported compression (only raw and zlib are handled)");
    const data: Promise<Buffer> = raw ? Promise.resolve(raw) : new Promise((res, rej) => inflate(zlibData as Buffer, (e, out) => (e ? rej(e) : res(out))));
    if (type === "OSMHeader") {
      header = decodeHeader(await data);
      const unsupported = header.requiredFeatures.filter((x) => x !== "OsmSchema-V0.6" && x !== "DenseNodes" && x !== "HistoricalInformation");
      if (unsupported.length) throw new Error(`unsupported required features: ${unsupported.join(", ")}`);
    } else if (type === "OSMData") {
      sawData = true;
      inflight.push(data);
      inflight[inflight.length - 1].catch(() => undefined); // surfaced when drained, not as an unhandled rejection
      if (inflight.length >= parallel) await drainOne();
    }
  }
  while (inflight.length) await drainOne();
  if (!header || !sawData) throw new Error("no OSM data found in the file");
  return { header, bytes: reader.consumed, md5: md5.digest("hex"), sha256: sha256.digest("hex") };
}
