import { useLiveQuery } from 'dexie-react-hooks';
import { BellRing, BookOpen, CalendarX2, CircleCheck, Hourglass, Users } from 'lucide-react';
import { db } from '../data/db';
import { useApp } from '../app/AppContext';
import { href } from '../app/router';
import { countdownText } from '../features/events/EventsScreen';
import { TodayMeetingsSection } from '../features/meetings/TodayMeetingsSection';
import { RoutineSection } from '../features/routine/RoutineSection';
import { TaskList } from '../features/tasks/TaskRow';
import { formatDayHeader, greeting } from '../domain/dates';
import { eventProgress, upcomingEvents } from '../domain/events';
import { countPhrase } from '../domain/labels';
import { meetingLists } from '../domain/meetings';
import { inboxView, snapshot, todayView } from '../domain/views';
import { EntityRow, ProgressBar } from '../ui/layoutParts';
import { EmptyState, LevelMark, Section } from '../ui/primitives';

/** מסך "בוקר טוב": כל מה שצריך לדעת בהצצה אחת, עוד לפני שמגיעים למשרד. */
export function MorningScreen() {
  const { today, tasks, meetings, events, openCapture } = useApp();
  const todays = todayView(tasks, today);
  const inbox = inboxView(tasks);
  const snap = snapshot(tasks, today);
  const toSummarize = meetingLists(meetings, tasks, today).toSummarize.length;
  const soonEvents = upcomingEvents(events, today, 21).filter((e) => e.targetDate !== null);
  const calm = snap.overdue === 0 && snap.nudges === 0;
  const guideSeen = useLiveQuery(async () => (await db.meta.get('guideSeen'))?.value === true, []);

  return (
    <div className="screen">
      <header className="screen-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 className="greeting">{greeting()}</h1>
          <p className="today-date">{formatDayHeader(today)}</p>
        </div>
        <LevelMark size={34} />
      </header>

      <nav className="pulse" aria-label="תמונת מצב">
        {snap.overdue > 0 && (
          <a className="pulse-item" data-tone="overdue" href={href('tasks', 'overdue')}>
            <CalendarX2 size={17} aria-hidden="true" />
            <b>{snap.overdue}</b> באיחור
          </a>
        )}
        {snap.nudges > 0 && (
          <a className="pulse-item" data-tone="nudge" href={href('waiting', undefined, { filter: 'nudge' })}>
            <BellRing size={17} aria-hidden="true" />
            <b>{snap.nudges}</b> לנדנד
          </a>
        )}
        {calm && (
          <span className="pulse-calm">
            <CircleCheck size={18} aria-hidden="true" />
            אין איחורים ואין את מי לנדנד
          </span>
        )}
        {snap.waiting > 0 && (
          <a className="pulse-item" href={href('waiting')}>
            <Hourglass size={17} aria-hidden="true" />
            <b>{snap.waiting}</b> ממתינים לתגובה
          </a>
        )}
        {toSummarize > 0 && (
          <a className="pulse-item" href={href('meetings')}>
            <Users size={17} aria-hidden="true" />
            {countPhrase(toSummarize, 'ישיבה אחת לסיכום', 'ישיבות לסיכום')}
          </a>
        )}
      </nav>

      {guideSeen === false && (
        <a className="guide-hint" href={href('guide')}>
          <BookOpen size={20} aria-hidden="true" />
          <span>
            <b>פעם ראשונה בפלס?</b> מדריך קצר: קליטה מהירה, ממתינים, ישיבות ואירועים.
          </span>
        </a>
      )}

      <RoutineSection today={today} />
      <TodayMeetingsSection />

      <Section title="דורש טיפול היום" count={todays.length}>
        {todays.length === 0 ? (
          <div className="panel">
            <EmptyState
              title="שום דבר לא בוער היום"
              text="אין משימות חורגות, דחופות או כאלה שראש המינהל מחכה להן."
              action={
                <button type="button" className="btn btn-quiet" onClick={() => openCapture()}>
                  קליטת משימה
                </button>
              }
            />
          </div>
        ) : (
          <TaskList tasks={todays} />
        )}
      </Section>

      {soonEvents.length > 0 && (
        <Section title="אירועים קרובים" count={soonEvents.length}>
          <div className="panel">
            {soonEvents.map((e) => {
              const p = eventProgress(tasks, e.id);
              return (
                <EntityRow
                  key={e.id}
                  href={href('event', e.id)}
                  title={e.title}
                  meta={<span>{countdownText(e.targetDate, today)}</span>}
                  trailing={p.total > 0 ? <ProgressBar done={p.done} total={p.total} label={`${p.done} מתוך ${p.total} הושלמו`} /> : undefined}
                />
              );
            })}
          </div>
        </Section>
      )}

      {inbox.length > 0 && (
        <Section title="נקלטו ומחכות למיון" count={inbox.length}>
          <TaskList tasks={inbox} />
        </Section>
      )}
    </div>
  );
}
