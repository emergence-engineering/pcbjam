/**
 * Minimal store-only (no compression) ZIP writer — enough to bundle a project's
 * files for a single "Download .zip" export. Hand-rolled to keep the GPL bundle
 * dependency-free (same ethos as sync-client's raw IndexedDB store). KiCad
 * projects are a handful of text files, so skipping DEFLATE is a fine trade for
 * zero deps. Entries are stored with the UTF-8 name flag set; timestamps are
 * zeroed (we don't track per-file mtimes here).
 */

export interface ZipEntry {
  /** Forward-slash relative path inside the archive. */
  path: string;
  bytes: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Build a store-only ZIP archive from the given entries. */
export function zipFiles(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n: number) =>
    new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

  for (const e of entries) {
    const name = enc.encode(e.path);
    const crc = crc32(e.bytes);
    const size = e.bytes.length;
    const flags = 0x0800; // bit 11: filename is UTF-8

    // Local file header + name + data.
    const local = concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(flags),
      u16(0), // method 0 = store
      u16(0), // mod time
      u16(0), // mod date
      u32(crc),
      u32(size), // compressed size (== uncompressed for store)
      u32(size), // uncompressed size
      u16(name.length),
      u16(0), // extra len
      name,
      e.bytes,
    ]);
    chunks.push(local);

    // Central directory header for this entry.
    central.push(
      concat([
        u32(0x02014b50),
        u16(20), // version made by
        u16(20), // version needed
        u16(flags),
        u16(0), // method
        u16(0), // mod time
        u16(0), // mod date
        u32(crc),
        u32(size),
        u32(size),
        u16(name.length),
        u16(0), // extra len
        u16(0), // comment len
        u16(0), // disk number start
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset), // local header offset
        name,
      ]),
    );

    offset += local.length;
  }

  const centralBlob = concat(central);
  const eocd = concat([
    u32(0x06054b50),
    u16(0), // this disk
    u16(0), // disk with central dir
    u16(entries.length),
    u16(entries.length),
    u32(centralBlob.length),
    u32(offset), // central dir offset
    u16(0), // comment len
  ]);

  return concat([...chunks, centralBlob, eocd]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
