import {
  cloudflareTest,
} from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Inline stub for the apptly-website service binding;
// miniflare won't start with an unresolved `[[services]]`
// target. The 501 / branded body also lets the apptly.co
// delegation row assert end-to-end without a real
// apptly-website worker.
const apptlyWebsiteStub = `
  export default {
    fetch() {
      return new Response('apptly-website stub (vitest)', {
        status: 501,
      });
    },
  };
`;

// Deterministic taistamp seed for the workerd pool —
// `test:` selector + 32 zero bytes RFC 4648 §4 base64.
// Explicit binding keeps signed-row assertions stable
// regardless of local secret state.
const TEST_TAISTAMP_SECRETS = `test:${'A'.repeat(43)}=`;

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: {
              configPath: './wrangler.toml',
            },
            miniflare: {
              bindings: {
                TAISTAMP_SECRETS: TEST_TAISTAMP_SECRETS,
              },
              workers: [{
                name: 'apptly-website',
                modules: true,
                script: apptlyWebsiteStub,
              }],
            },
          }),
        ],
        test: {
          name: 'workerd',
          include: ['src/**/*.workerd.test.ts'],
        },
      },
      {
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.workerd.test.ts'],
        },
      },
    ],
  },
});
