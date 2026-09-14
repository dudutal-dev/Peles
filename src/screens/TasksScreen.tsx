import { Search, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useApp } from '../app/AppContext';
import { href, type Route, type TasksTab } from '../app/router';
import { TaskList, TaskRow } from '../features/tasks/TaskRow';
import { STATUS_LABEL, countPhrase } from '../domain/labels';
import type { Task } from '../domain/types';
import {
  contextGroups,
  filterByTag,
  openTasks,
  overdueView,
  recentlyDone,
  searchTasks,
  tagCounts,
  todayView,
} from '../domain/views';
import { EmptyState, Section } from '../ui/primitives';

const TABS: Array<{ tab: TasksTab; label: string }> = [
  { tab: 'today', label: 'היום' },
  { tab: 'overdue', label: 'חורג' },
  { tab: 'context', label: 'לפי הקשר' },
  { tab: 'all', label: 'הכל' },
];

export function TasksScreen({ route }: { route: Route }) {
  const { today, tasks, openCapture } = useApp();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const searchId = useId();

  const tags = tagCounts(tasks).slice(0, 10);
  const scoped = filterByTag(tasks, tag);
  const searching = query.trim().length > 0;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1 className="screen-title">משימות</h1>
      </header>

      <div className="search" role="search">
        <Search size={18} aria-hidden="true" />
        <label htmlFor={searchId} className="visually-hidden">
          חיפוש משימה
        </label>
        <input
          id={searchId}
          type="search"
          className="input"
          placeholder="מה קורה עם..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
        />
      </div>

      {!searching && (
        <nav className="segmented" data-size="tabs" aria-label="תצוגות משימות">
          {TABS.map(({ tab, label }) => (
            <a
              key={tab}
              className="segmented-option"
              href={href('tasks', tab)}
              aria-current={route.tab === tab ? 'page' : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
      )}

      {tags.length > 0 && (
        <div className="chips filter-row" role="group" aria-label="סינון לפי תגית">
          {tags.map(({ tag: t, count }) => (
            <button
              key={t}
              type="button"
              className="chip"
              aria-pressed={tag === t}
              onClick={() => setTag((cur) => (cur === t ? null : t))}
            >
              #{t} <span className="num">{count}</span>
              {tag === t && <X size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}

      {searching ? (
        <SearchResults tasks={searchTasks(scoped, query)} query={query} />
      ) : route.tab === 'today' ? (
        <TodayTab tasks={todayView(scoped, today)} onCapture={() => openCapture()} />
      ) : route.tab === 'overdue' ? (
        <SimpleTab
          tasks={overdueView(scoped, today)}
          emptyTitle="שום דבר לא חורג"
          emptyText="כל המשימות עם תאריך יעד עדיין בזמן."
        />
      ) : route.tab === 'context' ? (
        <ContextTab tasks={scoped} />
      ) : (
        <AllTab tasks={scoped} />
      )}
    </div>
  );
}

function TodayTab({ tasks, onCapture }: { tasks: Task[]; onCapture: () => void }) {
  return (
    <Section title="על הפרק עכשיו" count={tasks.length}>
      {tasks.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="אין משימות להיום"
            text="אין מה שחורג, דחוף או מגיע למועד היום."
            action={
              <button type="button" className="btn btn-quiet" onClick={onCapture}>
                קליטת משימה
              </button>
            }
          />
        </div>
      ) : (
        <TaskList tasks={tasks} />
      )}
    </Section>
  );
}

function SimpleTab({ tasks, emptyTitle, emptyText }: { tasks: Task[]; emptyTitle: string; emptyText: string }) {
  return (
    <Section title="עבר תאריך היעד" count={tasks.length}>
      {tasks.length === 0 ? (
        <div className="panel">
          <EmptyState title={emptyTitle} text={emptyText} />
        </div>
      ) : (
        <TaskList tasks={tasks} />
      )}
    </Section>
  );
}

function ContextTab({ tasks }: { tasks: Task[] }) {
  const { today } = useApp();
  const groups = contextGroups(tasks, today);
  if (groups.length === 0) {
    return (
      <div className="section">
        <div className="panel">
          <EmptyState tone="neutral" title="אין משימות פתוחות" />
        </div>
      </div>
    );
  }
  const onlyLoose = groups.length === 1 && groups[0]?.key === 'none';
  return (
    <>
      {onlyLoose && (
        <p className="screen-sub" style={{ marginBlockStart: 16 }}>
          אפשר לשייך משימה לפרויקט, לגורם, לישיבה או לאירוע מתוך פרטי המשימה, ואז היא תקובץ כאן.
        </p>
      )}
      {groups.map((g) => (
        <section key={g.key} className="section" aria-label={g.title} style={{ marginBlockStart: 14 }}>
          <div className="panel">
            <div className="group-head">
              <h2 className="group-title">{g.title}</h2>
              {g.subtitle && <span className="group-sub">{g.subtitle}</span>}
              <span className="group-count">
                {g.overdueCount > 0 && <span className="group-overdue">{g.overdueCount} באיחור</span>}
                <span>{countPhrase(g.tasks.length, 'פתוחה אחת', 'פתוחות')}</span>
              </span>
            </div>
            {g.tasks.map((t) => (
              <TaskRow key={t.id} task={t} hideContext />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function AllTab({ tasks }: { tasks: Task[] }) {
  const open = openTasks(tasks);
  const done = recentlyDone(tasks, Date.now());
  const byStatus = (['todo', 'waiting', 'verify'] as const).map((status) => ({
    status,
    tasks: open.filter((t) => t.status === status),
  }));

  if (open.length === 0 && done.length === 0) {
    return (
      <div className="section">
        <div className="panel">
          <EmptyState tone="neutral" title="אין משימות עדיין" text="משימה חדשה נוספת מהכפתור שבמרכז הסרגל התחתון." />
        </div>
      </div>
    );
  }

  return (
    <>
      {byStatus
        .filter((g) => g.tasks.length > 0)
        .map((g) => (
          <Section key={g.status} title={STATUS_LABEL[g.status]} count={g.tasks.length}>
            <TaskList tasks={g.tasks} />
          </Section>
        ))}
      {done.length > 0 && (
        <Section title="הושלמו בשבוע האחרון" count={done.length}>
          <TaskList tasks={done} />
        </Section>
      )}
    </>
  );
}

function SearchResults({ tasks, query }: { tasks: Task[]; query: string }) {
  return (
    <Section title="תוצאות" count={tasks.length}>
      {tasks.length === 0 ? (
        <div className="panel">
          <EmptyState tone="neutral" title={`לא נמצאה משימה עם "${query.trim()}"`} text="החיפוש עובר על כותרת, הערות, גורם, הקשר ותגיות." />
        </div>
      ) : (
        <TaskList tasks={tasks} />
      )}
    </Section>
  );
}
