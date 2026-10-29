import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

describe('digest page', () => {
  it('renders 2026-10-28 as one table', async () => {
    const res = await createApp({ ...base, runsDir: 'runs' }).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr/g)).toHaveLength(5);
    expect(html).toContain('<th>last status</th>');
  });

  it('404s for a night with no file', async () => {
    const res = await createApp({ ...base, runsDir: 'runs' }).request('/digest/2020-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for that night');
  });

  it('says nothing ran for an empty file, and counts bad lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    writeFileSync(join(dir, '2026-01-02.jsonl'), 'garbage\n');
    const app = createApp({ ...base, runsDir: dir });
    expect(await (await app.request('/digest/2026-01-01')).text()).toContain('nothing ran');
    expect(await (await app.request('/digest/2026-01-02')).text()).toContain('1 line could not be read');
  });
});
