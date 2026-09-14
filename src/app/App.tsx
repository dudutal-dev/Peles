import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { db } from '../data/db';
import { ensureSeeded } from '../data/meta';
import { purgeOldChecks } from '../data/routineRepo';
import { purgeDeletedTasks } from '../data/taskRepo';
import { snapshot } from '../domain/views';
import { CaptureSheet } from '../features/capture/CaptureSheet';
import { TaskSheet } from '../features/tasks/TaskSheet';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useToday } from '../hooks/useToday';
import { applyUpdate, isStandalone, onUpdateAvailable, requestPersistentStorage } from '../pwa/pwa';
import { MorningScreen } from '../screens/MorningScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { WaitingScreen } from '../screens/WaitingScreen';
import { useToast } from '../ui/Toast';
import { AppContext, type AppContextValue } from './AppContext';
import { replaceHash, useRoute } from './router';
import { TabBar } from './TabBar';

export function App() {
  const route = useRoute();
  const today = useToday();
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const toast = useToast();
  const mainRef = useRef<HTMLElement>(null);

  const [taskId, setTaskId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);

  useKeyboardInset();

  useEffect(() => {
    void (async () => {
      await ensureSeeded(db);
      await purgeDeletedTasks(db);
      await purgeOldChecks(db, today);
      if (isStandalone()) await requestPersistentStorage();
    })();
    // פעם אחת בעלייה; ניקוי סימוני שגרה ישנים לא צריך לרוץ שוב כשהיום מתחלף
  }, []);

  useEffect(
    () =>
      onUpdateAvailable(() =>
        toast({ message: 'גרסה חדשה של פלס מוכנה', actionLabel: 'רענון', onAction: applyUpdate, durationMs: 60_000 }),
      ),
    [toast],
  );

  // מעבר מסך: גלילה למעלה ופוקוס לתוכן, בשביל קוראי מסך
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, [route.screen, route.tab]);

  const openCapture = useCallback(() => {
    // flushSync: הגיליון והמקלדת נפתחים בתוך אותה לחיצה (נדרש ב-iOS)
    flushSync(() => setCaptureOpen(true));
  }, []);

  // קיצור דרך מהאייקון במסך הבית: ‎#/morning?capture=1
  useEffect(() => {
    if (route.params.get('capture') === '1') {
      setCaptureOpen(true);
      replaceHash(`#/${route.screen}`);
    }
  }, [route]);

  const value = useMemo<AppContextValue>(
    () => ({ today, tasks: tasks ?? [], openTask: setTaskId, openCapture }),
    [today, tasks, openCapture],
  );

  const closeTask = useCallback(() => setTaskId(null), []);
  const closeCapture = useCallback(() => setCaptureOpen(false), []);

  return (
    <AppContext.Provider value={value}>
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
        דילוג לתוכן
      </button>
      <div className="app">
        <main ref={mainRef} tabIndex={-1} style={{ outline: 'none' }}>
          {tasks === undefined ? null : route.screen === 'waiting' ? (
            <WaitingScreen route={route} />
          ) : route.screen === 'tasks' ? (
            <TasksScreen route={route} />
          ) : route.screen === 'more' ? (
            <MoreScreen />
          ) : (
            <MorningScreen />
          )}
        </main>
      </div>
      <TabBar route={route} snap={tasks ? snapshot(tasks, today) : null} onCapture={openCapture} />
      <CaptureSheet open={captureOpen} onClose={closeCapture} />
      <TaskSheet taskId={taskId} onClose={closeTask} />
    </AppContext.Provider>
  );
}
