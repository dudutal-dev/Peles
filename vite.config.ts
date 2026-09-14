import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { serviceWorkerPlugin } from './build/serviceWorkerPlugin.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// מזהה build קצר שמוצג בהגדרות, כדי לוודא שהטלפון קיבל את הגרסה האחרונה
const buildId = process.env.GITHUB_SHA?.slice(0, 7) ?? `local-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '')}`;

export default defineConfig({
  // נתיבים יחסיים: האפליקציה תעבוד מכל כתובת אחסון (גם מתוך תת-תיקייה)
  base: './',
  plugins: [react(), serviceWorkerPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
