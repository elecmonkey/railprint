import { join } from 'node:path';
import type { DataLayout } from '@railprint/layout';
import { describeError, downloadSource } from './download.ts';
import { LockedError, withFileLock } from './file-lock.ts';
import { readLock, recordLockEntry } from './lock.ts';
import type { SourceDefinition } from './manifest.ts';
import { sourceStatus } from './status.ts';

export interface FetchOptions {
  /** Download again even if the file matches the lock. */
  force?: boolean;
  log?: (line: string) => void;
}

/**
 * Downloads the sources that are missing or differ from the lock and records
 * them in it. Returns how many failed.
 */
export async function fetchSources(
  layout: DataLayout,
  sources: readonly SourceDefinition[],
  { force = false, log = () => {} }: FetchOptions = {},
): Promise<number> {
  let failures = 0;
  for (const source of sources) {
    const destination = join(layout.sources, source.path);
    try {
      // One process per file; other processes skip it and move on.
      await withFileLock(`${destination}.lock`, async () => {
        // Re-read: another process may have finished this file meanwhile.
        const current = await readLock(layout.sourcesLock);
        const status = await sourceStatus(source, layout.sources, current);
        if (status.state === 'ok' && !force) {
          log(`${source.id}: up to date`);
          return;
        }
        const entry = await downloadSource(source, destination, { log });
        await recordLockEntry(layout.sourcesLock, entry);
      });
    } catch (error) {
      if (error instanceof LockedError) {
        log(
          `${source.id}: being downloaded by process ${error.holder}, skipped`,
        );
        continue;
      }
      failures++;
      log(`${source.id}: FAILED — ${describeError(error)}`);
    }
  }
  return failures;
}
