import { BellRing, CalendarX2, CircleCheck, Hourglass } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { href } from '../app/router';
import { AppointmentsSection } from '../features/appointments/AppointmentsSection';
import { RoutineSection } from '../features/routine/RoutineSection';
import { TaskList } from '../features/tasks/TaskRow';
import { formatDayHeader, greeting } from '../domain/dates';
import { inboxView, snapshot, todayView } from '../domain/views';
import { EmptyState, LevelMark, Section } from '../ui/primitives';

/** מסך "בוקר טוב": כל מה שצריך לדעת בהצצה אחת, עוד לפני שמגיעים למשרד. */
export function MorningScreen() {
  const { today, tasks, openCapture } = useApp();
  const todays = todayView(tasks, today);
  const inbox = inboxView(tasks);
  const snap = snapshot(tasks, today);
  const calm = snap.overdue === 0 && snap.nudges === 0;

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
      </nav>

      <RoutineSection today={today} />
      <AppointmentsSection today={today} />

      <Section title="דורש טיפול היום" count={todays.length}>
        {todays.length === 0 ? (
          <div className="panel">
            <EmptyState
              title="שום דבר לא בוער היום"
              text="אין משימות חורגות, דחופות או כאלה שראש המינהל מחכה להן."
              action={
                <button type="button" className="btn btn-quiet" onClick={openCapture}>
                  קליטת משימה
                </button>
              }
            />
          </div>
        ) : (
          <TaskList tasks={todays} />
        )}
      </Section>

      {inbox.length > 0 && (
        <Section title="נקלטו ומחכות למיון" count={inbox.length}>
          <TaskList tasks={inbox} />
        </Section>
      )}
    </div>
  );
}
