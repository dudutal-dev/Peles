import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { build, type Plugin, type ResolvedConfig } from 'vite';

const VERSION_PLACEHOLDER = '__SW_VERSION_PLACEHOLDER__';

/**
 * בונה את src/sw/sw.ts לקובץ sw.js עצמאי (IIFE) אחרי ה-build הראשי,
 * עם רשימת כל הקבצים שנבנו (precache) וגרסה שנגזרת מהתוכן.
 */
export function serviceWorkerPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'lishka-service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      // ‎.woff ישן נחוץ רק לדפדפנים שלא תומכים ב-woff2 — אין טעם לשמור אותו מראש
      const files = listFiles(outDir).filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.endsWith('.woff'));
      const precache = ['./', ...files];

      const result = await build({
        configFile: false,
        root: config.root,
        logLevel: 'warn',
        publicDir: false,
        define: {
          __PRECACHE__: JSON.stringify(precache),
          __SW_VERSION__: JSON.stringify(VERSION_PLACEHOLDER),
        },
        build: {
          write: false,
          emptyOutDir: false,
          minify: true,
          lib: {
            entry: resolve(config.root, 'src/sw/sw.ts'),
            formats: ['iife'],
            name: 'palasServiceWorker',
            fileName: () => 'sw.js',
          },
        },
      });

      const outputs = (Array.isArray(result) ? result : [result]) as Array<{ output?: Array<{ type: string; code?: string }> }>;
      const chunk = outputs.flatMap((o) => o.output ?? []).find((o) => o.type === 'chunk' && typeof o.code === 'string');
      if (!chunk?.code) throw new Error('Service worker build produced no code');

      // הגרסה כוללת את קוד ה-worker ואת כל הקבצים, כך שכל שינוי מגיע למכשירים
      const hash = createHash('sha256').update(chunk.code);
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);

      writeFileSync(join(outDir, 'sw.js'), chunk.code.replaceAll(VERSION_PLACEHOLDER, version));
    },
  };
}

function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listFiles(full, root);
    return [relative(root, full).split(sep).join('/')];
  });
}
