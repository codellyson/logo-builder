export function encodeIco(pngs: { size: number; data: Uint8Array }[]): Uint8Array {
  const count = pngs.length
  const headerSize = 6 + 16 * count
  let totalSize = headerSize
  for (const p of pngs) totalSize += p.data.length

  const out = new Uint8Array(totalSize)
  const dv = new DataView(out.buffer)
  dv.setUint16(0, 0, true)
  dv.setUint16(2, 1, true)
  dv.setUint16(4, count, true)

  let dataOffset = headerSize
  for (let i = 0; i < count; i++) {
    const p = pngs[i]
    const entryOffset = 6 + 16 * i
    out[entryOffset] = p.size >= 256 ? 0 : p.size
    out[entryOffset + 1] = p.size >= 256 ? 0 : p.size
    out[entryOffset + 2] = 0
    out[entryOffset + 3] = 0
    dv.setUint16(entryOffset + 4, 1, true)
    dv.setUint16(entryOffset + 6, 32, true)
    dv.setUint32(entryOffset + 8, p.data.length, true)
    dv.setUint32(entryOffset + 12, dataOffset, true)
    out.set(p.data, dataOffset)
    dataOffset += p.data.length
  }
  return out
}
