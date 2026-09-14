import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { href, navigateAfterSheet } from '../../app/router';
import { formatShortDate } from '../../domain/dates';
import { countPhrase } from '../../domain/labels';
import { meetingLists, meetingTasks } from '../../domain/meetings';
import type { Meeting } from '../../domain/types';
import { isOpen } from '../../domain/task';
import { BackLink, EntityRow } from '../../ui/layoutParts';
import { EmptyState, Section } from '../../ui/primitives';
import { MeetingFormSheet } from './MeetingFormSheet';

export function MeetingsScreen() {
  const { today, meetings, tasks } = useApp();
  const [adding, setAdding] = useState(false);
  const lists = meetingLists(meetings, tasks, today);
  const nothing = lists.today.length + lists.toSummarize.length + lists.upcoming.length + lists.past.length === 0;

  const row = (m: Meeting, showDate: boolean) => {
    const items = meetingTasks(tasks, m.id);
    const open = items.filter(isOpen).length;
    return (
      <EntityRow
        key={m.id}
        href={href('meeting', m.id)}
        lead={showDate ? formatShortDate(m.date, today) : m.time || 'היום'}
        title={m.title}
        meta={
          <>
            {showDate && m.time && <span>{m.time}</span>}
            {m.participants.length > 0 && <span>{countPhrase(m.participants.length, 'משתתף אחד', 'משתתפים')}</span>}
            {items.length > 0 && <span>{countPhrase(items.length, 'החלטה אחת', 'החלטות')}</span>}
            {open > 0 && <span>{countPhrase(open, 'אחת פתוחה', 'פתוחות')}</span>}
            {m.closedAt !== null && <span className="meta-done">סוכמה</span>}
          </>
        }
      />
    );
  };

  return (
    <div className="screen">
      <BackLink href={href('more')} label="עוד" />
      <header className="screen-head">
        <h1 className="screen-title">ישיבות</h1>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden="true" />
          ישיבה חדשה
        </button>
      </header>

      {nothing && (
        <div className="panel">
          <EmptyState
            tone="neutral"
            title="עוד אין ישיבות"
            text="בישיבה אפשר לרשום שורה לכל התחייבות, והיא הופכת לבד למשימת מעקב."
          />
        </div>
      )}

      {lists.toSummarize.length > 0 && (
        <Section title="מחכות לסיכום" count={lists.toSummarize.length}>
          <div className="panel">{lists.toSummarize.map((m) => row(m, true))}</div>
        </Section>
      )}
      {lists.today.length > 0 && (
        <Section title="היום" count={lists.today.length}>
          <div className="panel">{lists.today.map((m) => row(m, false))}</div>
        </Section>
      )}
      {lists.upcoming.length > 0 && (
        <Section title="בקרוב" count={lists.upcoming.length}>
          <div className="panel">{lists.upcoming.map((m) => row(m, true))}</div>
        </Section>
      )}
      {lists.past.length > 0 && (
        <Section title="בחודש האחרון">
          <div className="panel">{lists.past.map((m) => row(m, true))}</div>
        </Section>
      )}

      <MeetingFormSheet
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(m) => navigateAfterSheet(href('meeting', m.id))}
      />
    </div>
  );
}
