import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { db } from '../../data/db';
import { addAppointment, deleteAppointment, restoreAppointment } from '../../data/routineRepo';
import { appointmentsOn } from '../../domain/routine';
import type { ISODate } from '../../domain/types';
import { Field, Section } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** יומן פנימי פשוט לשלב א'. סנכרון עם Google Calendar מתוכנן לשלב ב'. */
export function AppointmentsSection({ today }: { today: ISODate }) {
  const appts = useLiveQuery(() => db.appointments.where('date').equals(today).toArray(), [today]);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  if (!appts) return null;
  const list = appointmentsOn(appts, today);
  const now = nowHHMM();

  return (
    <Section
      title="פגישות היום"
      count={list.length}
      action={
        <button type="button" className="btn btn-quiet" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden="true" />
          פגישה
        </button>
      }
    >
      <div className="panel">
        {list.length === 0 ? (
          <div className="appt-row">
            <span className="appt-body appt-loc">אין פגישות רשומות להיום</span>
          </div>
        ) : (
          list.map((a) => (
            <div key={a.id} className="appt-row" data-past={a.time !== '' && a.time < now}>
              <span className="appt-time" data-empty={a.time === ''}>
                {a.time || 'כל היום'}
              </span>
              <div className="appt-body">
                <p className="appt-title">{a.title}</p>
                {a.location && <p className="appt-loc">{a.location}</p>}
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={`מחיקת הפגישה ${a.title}`}
                onClick={async () => {
                  await deleteAppointment(db, a.id);
                  toast({
                    message: 'הפגישה נמחקה',
                    actionLabel: 'ביטול',
                    onAction: () => void restoreAppointment(db, a.id),
                  });
                }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </div>
      <Sheet open={adding} onClose={() => setAdding(false)} title="פגישה חדשה">
        <AppointmentForm today={today} onDone={() => setAdding(false)} />
      </Sheet>
    </Section>
  );
}

function AppointmentForm({ today, onDone }: { today: ISODate; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [date, setDate] = useState(today);
  const [location, setLocation] = useState('');
  const ids = { title: useId(), time: useId(), date: useId(), location: useId() };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await addAppointment(db, { title, time, date, location });
        onDone();
      }}
    >
      <Field label="נושא" htmlFor={ids.title}>
        <input
          id={ids.title}
          data-autofocus
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="למשל: ישיבת הנהלת מינהל"
          required
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="שעה" htmlFor={ids.time}>
          <input id={ids.time} type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="תאריך" htmlFor={ids.date}>
          <input
            id={ids.date}
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value || today)}
          />
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
          הוספת פגישה
        </button>
      </div>
    </form>
  );
}
