import { runCommand } from 'citty';
import { describe, expect, it, vi } from 'vitest';

import { main } from '../index';

describe('main', () => {
  it('runs the stub and writes the banner to stdout', async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(
      (chunk) => {
        writes.push(String(chunk));
        return true;
      },
    );

    await runCommand(main, { rawArgs: [] });

    expect(writes.join('')).toContain('sass-dispatcher (stub)');
    spy.mockRestore();
  });
});
