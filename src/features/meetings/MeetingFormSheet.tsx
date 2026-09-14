import { useId, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { db } from '../../data/db';
import { addMeeting, updateMeeting } from '../../data/meetingRepo';
import type { Meeting } from '../../domain/types';
import { Field } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';

interface MeetingFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** קיימת = עריכה; אחרת יצירה */
  meeting?: Meeting;
  onCreated?: (meeting: Meeting) => void;
}

export function MeetingFormSheet({ open, onClose, meeting, onCreated }: MeetingFormSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={meeting ? 'עריכת פרטי הישיבה' : 'ישיבה או פגישה חדשה'}>
      <MeetingForm meeting={meeting} onDone={onClose} onCreated={onCreated} />
    </Sheet>
  );
}

function MeetingForm({
  meeting,
  onDone,
  onCreated,
}: {
  meeting: Meeting | undefined;
  onDone: () => void;
  onCreated: ((meeting: Meeting) => void) | undefined;
}) {
  const { today } = useApp();
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [time, setTime] = useState(meeting?.time ?? '');
  const [date, setDate] = useState(meeting?.date ?? today);
  const [location, setLocation] = useState(meeting?.location ?? '');
  const ids = { title: useId(), time: useId(), date: useId(), location: useId() };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        if (meeting) {
          await updateMeeting(db, meeting.id, { title: title.trim(), time, date, location: location.trim() });
          onDone();
        } else {
          const created = await addMeeting(db, { title, time, date, location });
          onDone();
          onCreated?.(created);
        }
      }}
    >
      <Field label="נושא" htmlFor={ids.title}>
        <input
          id={ids.title}
          data-autofocus
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="למשל: ישיבת סטטוס מרפאת חולון"
          required
        />
      </Field>
      <div className="two-col">
        <Field label="תאריך" htmlFor={ids.date}>
          <input id={ids.date} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || today)} />
        </Field>
        <Field label="שעה" htmlFor={ids.time}>
          <input id={ids.time} type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label="מיקום" htmlFor={ids.location}>
        <input
          id={ids.location}
          className="input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="לא חובה"
        />
      </Field>
      <div className="sheet-foot sheet-foot-sticky">
        <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
          {meeting ? 'שמירה' : 'הוספת ישיבה'}
        </button>
      </div>
    </form>
  );
}
