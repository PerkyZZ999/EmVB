/** A minimal byte string that passes the WOFF2 header check (tests only). */
export function fakeWoff2(size = 64, fill = 0): Uint8Array {
  const bytes = new Uint8Array(size).fill(fill);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x774f4632);
  view.setUint32(4, 0x00010000);
  view.setUint32(8, size);
  return bytes;
}
