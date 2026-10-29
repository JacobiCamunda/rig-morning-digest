import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const GOOD = '2026-10-27';
const EMPTY = '2026-10-26';
const BAD = '2026-10-25';
const MISSING = '2026-10-24';

const jsonl = (...lines: object[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // Written out of job order on purpose: rows must come back sorted by job.
  writeFileSync(
    join(runsDir, `${GOOD}.jsonl`),
    jsonl(
      { at: '2026-10-27T01:00:00+01:00', job: 'gamma-clean', status: 'ok', owner: 'sam' },
      { at: '2026-10-27T01:05:00+01:00', job: 'alpha-sync', status: 'retry', owner: 'ana', error: 'timeout' },
      { at: '2026-10-27T01:10:00+01:00', job: 'beta-export', status: 'ok', owner: null },
      { at: '2026-10-27T01:15:00+01:00', job: 'alpha-sync', status: 'ok', owner: 'ana' },
    ),
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    jsonl({ at: '2026-10-25T02:00:00+01:00', job: 'alpha-sync', status: 'ok', owner: 'ana' }) +
      'this is not json\n' +
      jsonl({ at: '2026-10-25T02:30:00+01:00', job: 'beta-export', status: 'fail', owner: null, error: 'boom' }),
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

type Body = { night: string; rows: DigestRow[]; badLines: number };

describe('GET /digest/:night', () => {
  it('renders 200 with the layout banner and one row per job', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await app.request(`/digest/${GOOD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    for (const job of ['alpha-sync', 'beta-export', 'gamma-clean']) {
      expect(html).toContain(job);
    }
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders the good lines of a night with a bad line', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha-sync');
    expect(html).toContain('beta-export');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns { night, rows, badLines } sorted by job', async () => {
    const res = await app.request(`/api/digest/${GOOD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.night).toBe(GOOD);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-sync', 'beta-export', 'gamma-clean']);
    expect(body.rows[0]).toMatchObject({ runs: 2, retries: 1, lastStatus: 'ok', lastError: null });
    expect(body.rows[1]?.owner).toBeNull();
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('returns no rows and no bad lines for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts one bad line and keeps the good ones', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-sync', 'beta-export']);
  });
});

describe('page and JSON agree', () => {
  it('lists job names in the same order in the HTML as in rows', async () => {
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    const body = (await (await app.request(`/api/digest/${GOOD}`)).json()) as Body;
    const jobs = body.rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(0);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
