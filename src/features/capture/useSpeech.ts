import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'אין הרשאה למיקרופון. אפשר לאשר בהגדרות הדפדפן, או להשתמש בכפתור ההכתבה במקלדת.',
  'service-not-allowed': 'אין הרשאה למיקרופון. אפשר להשתמש בכפתור ההכתבה במקלדת.',
  'no-speech': 'לא נקלט דיבור. אפשר לנסות שוב.',
  network: 'זיהוי דיבור בדפדפן צריך חיבור לרשת. בלי קליטה אפשר להשתמש בכפתור ההכתבה במקלדת.',
  'audio-capture': 'לא נמצא מיקרופון זמין.',
};

/** הקלדה קולית בעברית דרך מנגנון זיהוי הדיבור של הדפדפן. */
export function useSpeech(onText: (text: string) => void) {
  const Ctor = getRecognition();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => () => recRef.current?.abort(), []);

  const toggle = useCallback(() => {
    if (!Ctor) return;
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = 'he-IL';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r?.isFinal) onTextRef.current(r[0].transcript.trim());
      }
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] ?? 'זיהוי הדיבור נכשל. אפשר לנסות שוב או להקליד.');
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    setError(null);
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setError('זיהוי הדיבור לא הצליח להתחיל. אפשר לנסות שוב.');
    }
  }, [Ctor]);

  return { supported: Ctor !== null, listening, error, toggle };
}
