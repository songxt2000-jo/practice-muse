/**
 * Small helpers to tweak a single note token inside ABC notation text,
 * used by the manual note-correction mode in the practice studio.
 */

const NOTE_RE = /^([_^=]*)([A-Ga-g])([,']*)(\d*\/*\d*)$/;

export type ParsedNote = {
  accidental: string;
  letter: string;
  octaveMarks: string;
  duration: string;
};

export function parseNote(token: string): ParsedNote | null {
  const match = NOTE_RE.exec(token.trim());
  if (!match) return null;
  return {
    accidental: match[1] ?? "",
    letter: match[2] ?? "",
    octaveMarks: match[3] ?? "",
    duration: match[4] ?? "",
  };
}

function build(note: ParsedNote) {
  return `${note.accidental}${note.letter}${note.octaveMarks}${note.duration}`;
}

const ACCIDENTAL_VALUE: Record<string, number> = { __: -2, _: -1, "=": 0, "": 0, "^": 1, "^^": 2 };
const VALUE_ACCIDENTAL: Record<number, string> = { [-2]: "__", [-1]: "_", 0: "=", 1: "^", 2: "^^" };

/** Raise / lower the note by a semitone using ABC accidentals. */
export function shiftSemitone(token: string, direction: 1 | -1): string | null {
  const note = parseNote(token);
  if (!note) return null;
  const current = ACCIDENTAL_VALUE[note.accidental] ?? 0;
  const next = Math.max(-2, Math.min(2, current + direction));
  if (next === current) return null;
  return build({ ...note, accidental: next === 0 ? "=" : (VALUE_ACCIDENTAL[next] ?? "") });
}

/** Raise / lower the note by a full octave. */
export function shiftOctave(token: string, direction: 1 | -1): string | null {
  const note = parseNote(token);
  if (!note) return null;
  const lower = note.letter === note.letter.toLowerCase();
  const ups = (note.octaveMarks.match(/'/g) ?? []).length;
  const downs = (note.octaveMarks.match(/,/g) ?? []).length;
  const level = (lower ? 1 : 0) + ups - downs + direction;
  if (level < -3 || level > 4) return null;

  const letter = level >= 1 ? note.letter.toLowerCase() : note.letter.toUpperCase();
  const marks = level >= 1 ? "'".repeat(level - 1) : ",".repeat(-level);
  return build({ ...note, letter, octaveMarks: marks });
}

/** Replace the note's length (e.g. "2" = double, "/2" = half of the unit note length). */
export function setDuration(token: string, duration: string): string | null {
  const note = parseNote(token);
  if (!note) return null;
  return build({ ...note, duration });
}

/** Replace the [start, end) slice of the ABC source with new text. */
export function replaceRange(abc: string, start: number, end: number, next: string): string {
  return abc.slice(0, start) + next + abc.slice(end);
}
