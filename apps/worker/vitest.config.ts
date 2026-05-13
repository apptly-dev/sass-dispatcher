import {
  cloudflareTest,
} from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

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
