import { runCommand } from 'citty';
import { describe, expect, it } from 'vitest';

import { main } from '../index';

describe('main', () => {
  it('throws E_NO_COMMAND when invoked with no subcommand', async () => {
    await expect(runCommand(main, { rawArgs: [] })).rejects.toMatchObject({
      name: 'CLIError',
      code: 'E_NO_COMMAND',
    });
  });

  it('throws E_UNKNOWN_COMMAND for an unrecognised subcommand', async () => {
    await expect(runCommand(main, { rawArgs: ['bogus'] })).rejects.toMatchObject({
      name: 'CLIError',
      code: 'E_UNKNOWN_COMMAND',
    });
  });
});
