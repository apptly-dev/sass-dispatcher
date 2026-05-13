// @ts-check
import { defineConfig } from '@poupe/eslint-config';

export default defineConfig({
  ignores: [
    '.tmp',
    '.wrangler',
    'coverage',
    'dist',
  ],
});
