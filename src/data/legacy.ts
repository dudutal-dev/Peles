import type { ISODate, Meeting, Timestamp } from '../domain/types';

/** פגישה מהיומן הפנימי של שלב א'. נשמר רק לצורך המרה של נתונים וגיבויים ישנים. */
export interface LegacyAppointment {
  id: string;
  title: string;
  date: ISODate;
  time: string;
  location: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

export function appointmentToMeeting(a: LegacyAppointment): Meeting {
  return {
    id: a.id,
    title: a.title,
    date: a.date,
    time: a.time ?? '',
    location: a.location ?? '',
    participants: [],
    notes: '',
    closedAt: null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    deletedAt: a.deletedAt ?? null,
  };
}
