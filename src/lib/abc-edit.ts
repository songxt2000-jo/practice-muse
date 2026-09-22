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

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

function levelOf(note: ParsedNote) {
  const lower = note.letter === note.letter.toLowerCase();
  const ups = (note.octaveMarks.match(/'/g) ?? []).length;
  const downs = (note.octaveMarks.match(/,/g) ?? []).length;
  return (lower ? 1 : 0) + ups - downs;
}

function withLevel(letter: string, level: number) {
  const l = level >= 1 ? letter.toLowerCase() : letter.toUpperCase();
  const marks = level >= 1 ? "'".repeat(level - 1) : ",".repeat(-level);
  return { letter: l, octaveMarks: marks };
}

/** Move the note one scale step (letter) up or down, e.g. C -> D, B -> c. */
export function shiftStep(token: string, direction: 1 | -1): string | null {
  const note = parseNote(token);
  if (!note) return null;
  const index = LETTERS.indexOf(note.letter.toUpperCase());
  if (index < 0) return null;
  let level = levelOf(note);
  let next = index + direction;
  if (next > 6) {
    next = 0;
    level += 1;
  } else if (next < 0) {
    next = 6;
    level -= 1;
  }
  if (level < -3 || level > 4) return null;
  const { letter, octaveMarks } = withLevel(LETTERS[next]!, level);
  return build({ ...note, letter, octaveMarks });
}

const SOLFEGE: Record<string, string> = {
  do: "C", re: "D", re2: "D", mi: "E", fa: "F", sol: "G", so: "G", la: "A", si: "B", ti: "B",
  "1": "C", "2": "D", "3": "E", "4": "F", "5": "G", "6": "A", "7": "B",
  哆: "C", 来: "D", 咪: "E", 发: "F", 索: "G", 拉: "A", 西: "B",
};

/**
 * Parse a human-friendly description such as "中央C" / "升fa" / "高音 la" / "低音 do 两拍"
 * into an ABC token. Returns null when nothing recognisable is found.
 */
export function parseHumanNote(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^(休止|休止符|空拍|静音)$/.test(raw) || raw.toLowerCase() === "z") return "z";

  const text = raw.toLowerCase().replace(/\s+/g, "");

  // Already valid ABC?
  if (parseNote(raw)) return raw.trim();

  let accidental = "";
  if (/(升|升高|sharp|#|♯|\^)/.test(text)) accidental = "^";
  else if (/(降|降低|flat|♭|b调)/.test(text) && !/^b/.test(text)) accidental = "_";
  else if (/(还原|本位|natural)/.test(text)) accidental = "=";

  let level = 0;
  if (/(中央|中音)/.test(text)) level = 0;
  if (/(高音|高八度|上八度)/.test(text)) level = 1;
  if (/(超高|特高|高两个八度)/.test(text)) level = 2;
  if (/(低音|低八度|下八度)/.test(text)) level = -1;
  if (/(超低|特低|低两个八度)/.test(text)) level = -2;

  let letter: string | null = null;
  for (const key of ["sol", "so", "do", "re", "mi", "fa", "la", "si", "ti"]) {
    if (text.includes(key)) {
      letter = SOLFEGE[key]!;
      break;
    }
  }
  if (!letter) {
    const cn = raw.match(/[哆来咪发索拉西]/);
    if (cn) letter = SOLFEGE[cn[0]]!;
  }
  if (!letter) {
    const ascii = raw.match(/(?:^|[^a-gA-G])([a-gA-G])(?![a-z])/);
    if (ascii?.[1]) {
      letter = ascii[1].toUpperCase();
      if (ascii[1] === ascii[1].toLowerCase() && !/(中央|中音|低音|高音)/.test(text)) level = 1;
    }
  }
  if (!letter) {
    const num = raw.match(/[1-7](?!拍)/);
    if (num) letter = SOLFEGE[num[0]]!;
  }
  if (!letter) return null;

  let duration = "";
  const beats = raw.match(/([0-9]+(?:\.5)?)拍/);
  if (/(附点)/.test(text)) duration = "3/2";
  else if (/(半拍)/.test(text)) duration = "/2";
  else if (beats?.[1]) {
    const value = Number(beats[1]);
    if (value === 1.5) duration = "3/2";
    else if (value > 1) duration = String(Math.round(value));
  }

  const oct = withLevel(letter, level);
  return build({ accidental, letter: oct.letter, octaveMarks: oct.octaveMarks, duration });
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
