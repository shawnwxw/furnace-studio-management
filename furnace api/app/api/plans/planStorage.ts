import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IdentifiedRecord, JsonStore } from '../../interface/planStorage';

// Hashes the stored list so callers can detect concurrent changes before saving.
export function revision(items: unknown[]) {
  return '"' + createHash('sha256').update(JSON.stringify(items)).digest('hex') + '"';
}

// Creates a validated JSON store with an independent write queue for one file.
export function jsonStore<Item extends IdentifiedRecord>(
  filename: string,
  isItem: (value: unknown) => value is Item,
): JsonStore<Item> {
  const file = path.join(process.cwd(), 'data', filename);
  let pendingWrite: Promise<unknown> = Promise.resolve();

  // Accepts only lists of valid records with unique IDs.
  function isList(value: unknown): value is Item[] {
    return Array.isArray(value) && value.every(isItem) &&
      new Set(value.map(item => item.id)).size === value.length;
  }

  // Loads and validates the stored JSON before exposing it to a controller.
  async function read() {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!isList(value)) throw new Error(`Invalid ${filename}`);
    return value;
  }

  // Queues the read and update together so competing requests check the latest revision.
  function update(transform: (current: Item[]) => Item[] | Response | Promise<Item[] | Response>) {
    const write = pendingWrite.then(async () => {
      const current = await read();
      const next = await transform(current);
      if (next instanceof Response) return next;
      if (revision(next) !== revision(current)) {
        // Write to a sibling file so the rename publishes a complete snapshot to readers.
        const temporary = file + '.' + randomUUID() + '.tmp';
        try {
          await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' });
          await rename(temporary, file);
        } finally {
          await rm(temporary, { force: true });
        }
      }
      return next;
    });
    // Keep later writes running even when the current write fails.
    pendingWrite = write.catch(() => {});
    return write;
  }

  return { isList, read, update };
}

// Returns a non-cacheable response while computing its revision from the original stored data.
export function snapshot(key: 'schedules' | 'items', items: unknown[], visibleItems = items) {
  return Response.json({ [key]: visibleItems, revision: revision(items) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

// Logs storage failures on the server and returns a generic message to the client.
export function storageError(resource: 'plan' | 'task', error: unknown) {
  console.error(`Storage failed for ${resource}:`, error);
  return Response.json({ error: `Could not access ${resource} storage.` }, { status: 500 });
}
