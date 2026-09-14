/** רישום service worker, הודעה על גרסה חדשה, והתקנה למסך הבית. */

type Listener = () => void;

let waitingWorker: ServiceWorker | null = null;
const updateListeners = new Set<Listener>();

export function onUpdateAvailable(listener: Listener): () => void {
  updateListeners.add(listener);
  if (waitingWorker) listener();
  return () => updateListeners.delete(listener);
}

export function applyUpdate(): void {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waitingWorker.postMessage('SKIP_WAITING');
}

function markWaiting(worker: ServiceWorker) {
  waitingWorker = worker;
  updateListeners.forEach((l) => l());
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      if (reg.waiting && navigator.serviceWorker.controller) markWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) markWaiting(worker);
        });
      });
      // בדיקת עדכון כשחוזרים לאפליקציה
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update();
      });
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  });
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: InstallPromptEvent | null = null;
const installListeners = new Set<Listener>();

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e as InstallPromptEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installListeners.forEach((l) => l());
  });
}

export function canPromptInstall(): boolean {
  return installPrompt !== null;
}

export function onInstallAvailabilityChange(listener: Listener): () => void {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

export async function promptInstall(): Promise<boolean> {
  if (!installPrompt) return false;
  await installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  installListeners.forEach((l) => l());
  return outcome === 'accepted';
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usageMB: number | null;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (!navigator.storage?.persisted) return { supported: false, persisted: false, usageMB: null };
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted(),
    navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(undefined),
  ]);
  const usage = estimate?.usage;
  return { supported: true, persisted, usageMB: usage === undefined ? null : usage / 1_048_576 };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
