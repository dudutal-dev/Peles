import '@fontsource/ibm-plex-sans-hebrew/400.css';
import '@fontsource/ibm-plex-sans-hebrew/500.css';
import '@fontsource/ibm-plex-sans-hebrew/600.css';
import '@fontsource/ibm-plex-sans-hebrew/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/task.css';
import './styles/sheet.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { captureInstallPrompt, registerServiceWorker } from './pwa/pwa';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ToastProvider } from './ui/Toast';

captureInstallPrompt();
registerServiceWorker();

// האפליקציה מנהלת גלילה בעצמה; שחזור אוטומטי קופץ כשגיליון נסגר דרך ההיסטוריה
window.history.scrollRestoration = 'manual';

if (import.meta.env.DEV) {
  void import('./data/demo').then(({ exposeDemo }) => exposeDemo());
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
