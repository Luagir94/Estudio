// Minimal pure-JS, STORE-only (uncompressed) ZIP writer used ONLY to build
// test fixtures at setup time (docxExtractor.test.ts — DOCX is an OOXML/ZIP
// container and mammoth has no writer). Deliberately self-contained instead
// of pulling in a zip-writing dependency: `archiver`/`jszip` are already
// present transitively (via mammoth/exceljs), but importing an undeclared
// transitive package is fragile — a future dependency bump can un-hoist it
// with no warning. STORE-only keeps this small: no deflate implementation
// needed, just headers + a standard CRC32.
const CRC_TABLE = buildCrcTable()

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntryInput {
  name: string
  content: string
}

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50

/** Builds a valid, uncompressed (STORE method) ZIP archive from in-memory text entries. */
export function buildMinimalZip(entries: readonly ZipEntryInput[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8')
    const dataBuffer = Buffer.from(entry.content, 'utf8')
    const checksum = crc32(dataBuffer)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0)
    localHeader.writeUInt16LE(20, 4) // version needed to extract
    localHeader.writeUInt16LE(0, 6) // general purpose flags
    localHeader.writeUInt16LE(0, 8) // compression method: 0 = store
    localHeader.writeUInt16LE(0, 10) // last mod file time
    localHeader.writeUInt16LE(0, 12) // last mod file date
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(dataBuffer.length, 18) // compressed size
    localHeader.writeUInt32LE(dataBuffer.length, 22) // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28) // extra field length

    localParts.push(localHeader, nameBuffer, dataBuffer)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_HEADER_SIGNATURE, 0)
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed to extract
    centralHeader.writeUInt16LE(0, 8) // general purpose flags
    centralHeader.writeUInt16LE(0, 10) // compression method
    centralHeader.writeUInt16LE(0, 12) // last mod file time
    centralHeader.writeUInt16LE(0, 14) // last mod file date
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(dataBuffer.length, 20) // compressed size
    centralHeader.writeUInt32LE(dataBuffer.length, 24) // uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra field length
    centralHeader.writeUInt16LE(0, 32) // comment length
    centralHeader.writeUInt16LE(0, 34) // disk number start
    centralHeader.writeUInt16LE(0, 36) // internal file attributes
    centralHeader.writeUInt32LE(0, 38) // external file attributes
    centralHeader.writeUInt32LE(offset, 42) // relative offset of local header

    centralParts.push(centralHeader, nameBuffer)

    offset += localHeader.length + nameBuffer.length + dataBuffer.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const centralDirectoryOffset = offset

  const endRecord = Buffer.alloc(22)
  endRecord.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0)
  endRecord.writeUInt16LE(0, 4) // disk number
  endRecord.writeUInt16LE(0, 6) // disk with central directory start
  endRecord.writeUInt16LE(entries.length, 8) // entries on this disk
  endRecord.writeUInt16LE(entries.length, 10) // total entries
  endRecord.writeUInt32LE(centralDirectory.length, 12) // size of central directory
  endRecord.writeUInt32LE(centralDirectoryOffset, 16) // offset of central directory
  endRecord.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...localParts, centralDirectory, endRecord])
}
