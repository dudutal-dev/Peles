import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { db } from '../data/db';
import { ensureSeeded } from '../data/meta';
import { purgeOldChecks } from '../data/routineRepo';
import { purgeDeletedTasks } from '../data/taskRepo';
import { buildEntityIndex } from '../domain/entities';
import { snapshot } from '../domain/views';
import { CaptureSheet } from '../features/capture/CaptureSheet';
import { ContactScreen } from '../features/contacts/ContactScreen';
import { ContactsScreen } from '../features/contacts/ContactsScreen';
import { EventScreen } from '../features/events/EventScreen';
import { EventsScreen } from '../features/events/EventsScreen';
import { MeetingScreen } from '../features/meetings/MeetingScreen';
import { MeetingsScreen } from '../features/meetings/MeetingsScreen';
import { TaskSheet } from '../features/tasks/TaskSheet';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { usePushSync } from '../hooks/usePushSync';
import { GuideScreen } from '../screens/GuideScreen';
import { useToday } from '../hooks/useToday';
import { applyUpdate, isStandalone, onUpdateAvailable, requestPersistentStorage } from '../pwa/pwa';
import { MorningScreen } from '../screens/MorningScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { WaitingScreen } from '../screens/WaitingScreen';
import { useToast } from '../ui/Toast';
import { AppContext, type AppContextValue } from './AppContext';
import { replaceHash, useRoute, type Route } from './router';
import { TabBar } from './TabBar';

export function App() {
  const route = useRoute();
  const today = useToday();
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const meetings = useLiveQuery(() => db.meetings.toArray(), []);
  const contacts = useLiveQuery(() => db.contacts.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);
  const toast = useToast();
  const mainRef = useRef<HTMLElement>(null);

  const [taskId, setTaskId] = useState<string | null>(null);
  const [capture, setCapture] = useState<{ open: boolean; initial: string }>({ open: false, initial: '' });

  useKeyboardInset();
  usePushSync(tasks, meetings);

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
  }, [route.screen, route.tab, route.id]);

  const openCapture = useCallback((initialText?: string) => {
    // flushSync: הגיליון והמקלדת נפתחים בתוך אותה לחיצה (נדרש ב-iOS).
    // typeof: הגנה מפני העברה ישירה ל-onClick, שמעביר אירוע במקום טקסט
    const initial = typeof initialText === 'string' ? initialText : '';
    flushSync(() => setCapture({ open: true, initial }));
  }, []);

  // קיצור דרך מהאייקון במסך הבית: ‎#/morning?capture=1
  useEffect(() => {
    if (route.params.get('capture') === '1') {
      setCapture({ open: true, initial: '' });
      replaceHash(`#/${route.screen}`);
    }
  }, [route]);

  const value = useMemo<AppContextValue>(
    () => ({
      today,
      tasks: tasks ?? [],
      meetings: meetings ?? [],
      contacts: contacts ?? [],
      events: events ?? [],
      index: buildEntityIndex(meetings ?? [], events ?? [], contacts ?? []),
      openTask: setTaskId,
      openCapture,
    }),
    [today, tasks, meetings, contacts, events, openCapture],
  );

  const closeTask = useCallback(() => setTaskId(null), []);
  const closeCapture = useCallback(() => setCapture((c) => ({ ...c, open: false })), []);
  const loaded = tasks !== undefined && meetings !== undefined && contacts !== undefined && events !== undefined;

  return (
    <AppContext.Provider value={value}>
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
        דילוג לתוכן
      </button>
      <div className="app">
        <main ref={mainRef} tabIndex={-1} style={{ outline: 'none' }}>
          {loaded && <CurrentScreen route={route} />}
        </main>
      </div>
      <TabBar route={route} snap={tasks ? snapshot(tasks, today) : null} onCapture={() => openCapture()} />
      <CaptureSheet open={capture.open} initialText={capture.initial} onClose={closeCapture} />
      <TaskSheet taskId={taskId} onClose={closeTask} />
    </AppContext.Provider>
  );
}

function CurrentScreen({ route }: { route: Route }) {
  switch (route.screen) {
    case 'waiting':
      return <WaitingScreen route={route} />;
    case 'tasks':
      return <TasksScreen route={route} />;
    case 'more':
      return <MoreScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'meetings':
      return <MeetingsScreen />;
    case 'meeting':
      return <MeetingScreen id={route.id ?? ''} />;
    case 'events':
      return <EventsScreen />;
    case 'event':
      return <EventScreen id={route.id ?? ''} />;
    case 'contacts':
      return <ContactsScreen />;
    case 'contact':
      return <ContactScreen id={route.id ?? ''} />;
    case 'guide':
      return <GuideScreen />;
    case 'morning':
      return <MorningScreen />;
  }
}
