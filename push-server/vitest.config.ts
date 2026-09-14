import { defineConfig } from 'vitest/config';

// Own config so vitest does not pick up the PWA's vite.config.ts from the parent folder.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
