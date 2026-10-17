import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Only the bundled fictional export is exposed; callers cannot select host files.
const source = new URL('../fixtures/prospects.csv', import.meta.url);
export async function readSampleProspects() {
  const csv = await readFile(source, 'utf8');
  return {
    source_uri: source.href,
    csv_sha256: createHash('sha256').update(csv).digest('hex'),
    csv,
  };
}
