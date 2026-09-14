import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { replaceHash, type Route } from '../app/router';
import { TaskList, TaskRow } from '../features/tasks/TaskRow';
import { countPhrase } from '../domain/labels';
import { daysWaiting, needsNudge, waitingByOwner, waitingView } from '../domain/views';
import { EmptyState, Segmented } from '../ui/primitives';

type Filter = 'all' | 'nudge' | 'week';
type Mode = 'time' | 'owner';

function readFilter(params: URLSearchParams): Filter {
  const f = params.get('filter');
  return f === 'nudge' || f === 'week' ? f : 'all';
}

/** "ממתין למישהו אחר": ממוין לפי כמה זמן זה תקוע. */
export function WaitingScreen({ route }: { route: Route }) {
  const { today, tasks } = useApp();
  const filter = readFilter(route.params);
  const [mode, setMode] = useState<Mode>('time');

  const all = waitingView(tasks);
  const nudges = all.filter((t) => needsNudge(t, today));
  const overWeek = all.filter((t) => daysWaiting(t, today) >= 7);
  const shown = filter === 'nudge' ? nudges : filter === 'week' ? overWeek : all;

  const setFilter = (f: Filter) => replaceHash(f === 'all' ? '#/waiting' : `#/waiting?filter=${f}`);

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">ממתין לתגובה</h1>
          <p className="screen-sub">מה שתקוע הכי הרבה זמן מופיע ראשון</p>
        </div>
      </header>

      {all.length > 0 && (
        <>
          <div className="field">
            <Segmented<Filter>
              label="סינון"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `הכל (${all.length})` },
                { value: 'nudge', label: `לנדנד (${nudges.length})` },
                { value: 'week', label: `מעל שבוע (${overWeek.length})` },
              ]}
            />
          </div>
          <div className="field">
            <Segmented<Mode>
              label="תצוגה"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'time', label: 'לפי זמן המתנה' },
                { value: 'owner', label: 'לפי גורם' },
              ]}
            />
          </div>
        </>
      )}

      {all.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="אף אחד לא מעכב אותך כרגע"
            text='אין פריטים שממתינים לתגובה. משימה שהאחריות עליה אצל גורם אחר תופיע כאן, עם ספירת הימים.'
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={filter === 'nudge' ? 'אין את מי לנדנד היום' : 'שום דבר לא ממתין מעל שבוע'}
          />
        </div>
      ) : mode === 'time' ? (
        <TaskList tasks={shown} variant="waiting" />
      ) : (
        waitingByOwner(shown).map((group) => (
          <section key={group.key} className="section" aria-label={group.title} style={{ marginBlockStart: 14 }}>
            <div className="panel">
              <div className="group-head">
                <h2 className="group-title">{group.title}</h2>
                <span className="group-count">{countPhrase(group.tasks.length, 'פריט אחד', 'פריטים')}</span>
              </div>
              {group.tasks.map((t) => (
                <TaskRow key={t.id} task={t} variant="waiting" hideOwner />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
