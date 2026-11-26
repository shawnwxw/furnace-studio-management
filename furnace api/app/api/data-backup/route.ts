import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ZipEntry } from '../../interface/zipArchive';
import { queueInventoryChange } from '../product/salesInventory';
import { zipEntries } from '../zipArchive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const backupDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
});

// Include saved folders and files, keeping the data directory at the archive root.
async function readDataDirectory(directory: string, archivePath: string, entries: ZipEntry[]) {
  const stat = await lstat(directory);
  if (!stat.isDirectory()) throw new Error('Invalid backup directory');
  entries.push({ name: archivePath + '/', bytes: Buffer.alloc(0) });
  for (const item of await readdir(directory, { withFileTypes: true })) {
    // Staged writes are published by rename. Capture only their saved destination.
    if (/\.[a-f0-9-]{36}\.tmp$/i.test(item.name) || /^\.(upload|removed)-/.test(item.name)) continue;
    const itemPath = path.join(directory, item.name);
    const archiveName = archivePath + '/' + item.name;
    if (item.isDirectory()) {
      await readDataDirectory(itemPath, archiveName, entries);
    } else if (item.isFile()) {
      const file = await open(itemPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        entries.push({ name: archiveName, bytes: await file.readFile() });
      } finally {
        await file.close();
      }
    }
  }
  return entries;
}

export async function GET() {
  try {
    const entries = await queueInventoryChange(() => readDataDirectory(path.join(process.cwd(), 'data'), 'data', []));
    const archive = zipEntries(entries);
    return new Response(new Uint8Array(archive), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="furnace-data-${backupDate.format(new Date())}.zip"`,
      },
    });
  } catch (error) {
    console.error('Could not prepare the data backup:', error);
    return Response.json({ error: 'Could not prepare the data backup.' }, { status: 500 });
  }
}
