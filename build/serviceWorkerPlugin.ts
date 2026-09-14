import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * יוצר sw.js אחרי ה-build, עם רשימת כל הקבצים שנבנו (precache).
 * הגרסה נגזרת מתוכן הקבצים, כך שכל שינוי בקוד מייצר עדכון.
 * כך האפליקציה נטענת במלואה גם בלי קליטה, בלי תלות ב-Workbox.
 */
export function serviceWorkerPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'lishka-service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = config.build.outDir;
      // ‎.woff ישן נחוץ רק לדפדפנים שלא תומכים ב-woff2 — אין טעם לשמור אותו מראש
      const files = listFiles(outDir).filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.endsWith('.woff'));
      // הגרסה כוללת גם את קוד ה-service worker עצמו, כך ששינוי בו מגיע למכשירים
      const hash = createHash('sha256').update(swSource('', []));
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const precache = ['./', ...files];
      writeFileSync(join(outDir, 'sw.js'), swSource(version, precache));
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

function swSource(version: string, precache: string[]): string {
  return `/* Generated at build time by build/serviceWorkerPlugin.ts. Do not edit. */
const CACHE = 'lishka-${version}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lishka-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ignoreVary: module scripts are requested with an Origin header, while the
  // precached copies were fetched without one; "Vary: Origin" would miss the cache.
  const options = { ignoreSearch: true, ignoreVary: true };

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html', options).then((cached) => cached || fetch(request)),
    );
    return;
  }

  event.respondWith(caches.match(request, options).then((cached) => cached || fetch(request)));
});
`;
}
