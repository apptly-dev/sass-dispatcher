import { runCommand } from 'citty';
import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import dns from '../commands/dns';
import { type DoHResourceRecord, type DoHResponse } from '../types';

interface Captured {
  error: string[]
  log: string[]
  stdout: string[]
}

function makeCaptured(): Captured {
  return { log: [], error: [], stdout: [] };
}

function joinMessages(messages: unknown[]): string {
  return messages.map(String).join(' ');
}

function makeAnswer(overrides: Partial<DoHResourceRecord> = {}): DoHResourceRecord {
  return {
    TTL: 300,
    data: '104.26.0.41',
    name: 'apptly.me.',
    type: 1,
    ...overrides,
  };
}

function makeResponse(overrides: Partial<DoHResponse> = {}): DoHResponse {
  return {
    AD: false,
    CD: false,
    Question: [{ name: 'apptly.me.', type: 1 }],
    RA: true,
    RD: true,
    Status: 0,
    TC: false,
    ...overrides,
  };
}

function makeJSONResponse(body: DoHResponse): Response {
  return Response.json(body, {
    headers: { 'content-type': 'application/dns-json' },
  });
}

describe('cli dns', () => {
  let captured: Captured;
  let savedExitCode: typeof process.exitCode;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captured = makeCaptured();
    savedExitCode = process.exitCode;
    consola.wrapAll();
    consola.mockTypes((type) => vi.fn((...messages: unknown[]) => {
      const line = joinMessages(messages);
      if (type === 'error' || type === 'fatal' || type === 'warn') {
        captured.error.push(line);
      } else {
        captured.log.push(line);
      }
    }));
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(
      (chunk: string | Uint8Array) => {
        captured.stdout.push(String(chunk));
        return true;
      },
    );
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    consola.restoreAll();
    stdoutSpy.mockRestore();
    fetchSpy.mockRestore();
    process.exitCode = savedExitCode;
  });

  it('writes one row per answer with the type code mapped to its name', async () => {
    fetchSpy.mockResolvedValue(makeJSONResponse(makeResponse({
      Answer: [
        makeAnswer(),
        makeAnswer({ data: '172.67.68.219' }),
      ],
    })));

    await runCommand(dns, { rawArgs: ['apptly.me'] });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0]!;
    expect(String(calledUrl)).toBe(
      'https://cloudflare-dns.com/dns-query?name=apptly.me&type=A',
    );
    expect((calledInit as RequestInit).headers).toEqual({
      accept: 'application/dns-json',
    });
    expect(captured.stdout.join('')).toBe(
      'apptly.me. 300 A 104.26.0.41\n' +
      'apptly.me. 300 A 172.67.68.219\n',
    );
    expect(captured.error).toHaveLength(0);
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('emits one JSON envelope per answer when --json is set', async () => {
    const answer = makeAnswer();
    fetchSpy.mockResolvedValue(makeJSONResponse(makeResponse({
      Answer: [answer],
    })));

    await runCommand(dns, { rawArgs: ['apptly.me', '--json'] });

    expect(captured.stdout.join('')).toBe(`${JSON.stringify(answer)}\n`);
  });

  it('passes the --type flag through to the DoH endpoint', async () => {
    fetchSpy.mockResolvedValue(makeJSONResponse(makeResponse({
      Answer: [makeAnswer({ type: 28, data: '2606:4700::1' })],
    })));

    await runCommand(dns, { rawArgs: ['apptly.me', '--type', 'AAAA'] });

    const [calledUrl] = fetchSpy.mock.calls[0]!;
    expect(String(calledUrl)).toBe(
      'https://cloudflare-dns.com/dns-query?name=apptly.me&type=AAAA',
    );
    expect(captured.stdout.join('')).toBe('apptly.me. 300 AAAA 2606:4700::1\n');
  });

  it('falls back to the numeric type code for types it does not name', async () => {
    fetchSpy.mockResolvedValue(makeJSONResponse(makeResponse({
      Answer: [makeAnswer({ type: 999, data: 'opaque' })],
    })));

    await runCommand(dns, { rawArgs: ['apptly.me', '--type', '999'] });

    expect(captured.stdout.join('')).toBe('apptly.me. 300 999 opaque\n');
  });

  it('warns when the answer section is empty under a NOERROR status', async () => {
    fetchSpy.mockResolvedValue(makeJSONResponse(makeResponse({ Answer: [] })));

    await runCommand(dns, { rawArgs: ['apptly.me'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('no A records for apptly.me');
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('surfaces the numeric status when the response signals an error', async () => {
    fetchSpy.mockResolvedValue(makeJSONResponse(makeResponse({
      Comment: 'NXDOMAIN: no such host',
      Question: [{ name: 'absent.example.', type: 1 }],
      Status: 3,
    })));

    await runCommand(dns, { rawArgs: ['absent.example'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('DoH status 3 for absent.example A');
    expect(captured.error.join('\n')).toContain('NXDOMAIN: no such host');
    expect(process.exitCode).toBe(savedExitCode);
  });

  it('exits non-zero when the DoH endpoint returns a non-2xx response', async () => {
    fetchSpy.mockResolvedValue(new Response('Bad Gateway', {
      status: 502,
      statusText: 'Bad Gateway',
    }));

    await runCommand(dns, { rawArgs: ['apptly.me'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('HTTP 502');
    expect(process.exitCode).toBe(1);
  });

  it('exits non-zero when fetch itself rejects', async () => {
    fetchSpy.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await runCommand(dns, { rawArgs: ['apptly.me'] });

    expect(captured.stdout).toHaveLength(0);
    expect(captured.error.join('\n')).toContain('getaddrinfo ENOTFOUND');
    expect(process.exitCode).toBe(1);
  });
});
