import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';

export type Counts = { ok: number; retry: number; fail: number };

// Counts parsed lines by status. Bad lines are not counted. Null when the file is missing.
export function countStatuses(runsDir: string, night: string): Counts | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: Counts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line) counts[line.status]++;
  }
  return counts;
}
