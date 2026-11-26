import type { ZipEntry } from '../interface/zipArchive';

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) {
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return crc;
});

// Computes the CRC-32 required by each stored ZIP entry.
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

// Counts stored ZIP headers and payloads without reading the picture files.
export function zipSize(entries: { name: string; size: number }[]) {
  return entries.reduce((total, entry) => total + 76 + Buffer.byteLength(entry.name) * 2 + entry.size, 22);
}

// Stores entries without recompressing them and adds a CRC for each file.
export function zipEntries(entries: ZipEntry[]) {
  const files: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;

  for (const { name, bytes } of entries) {
    const filename = Buffer.from(name);
    const checksum = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(filename.length, 26);
    files.push(local, filename, bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, filename);
    offset += local.length + filename.length + bytes.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.reduce((total, entry) => total + entry.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, ...directory, end]);
}
