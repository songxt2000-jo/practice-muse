const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FIRST_MIDI = 48; // C3
const LAST_MIDI = 84; // C6

function isBlack(midi: number) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

function label(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function PianoKeyboard({
  active,
  onKeyPress,
}: {
  active: number[];
  onKeyPress?: (midi: number) => void;
}) {
  const midis: number[] = [];
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m += 1) midis.push(m);
  const whites = midis.filter((m) => !isBlack(m));
  const whiteWidth = 100 / whites.length;

  return (
    <div className="relative h-32 w-full select-none rounded-lg bg-ebony p-2 shadow-key">
      <div className="relative h-full w-full">
        {whites.map((midi, index) => {
          const on = active.includes(midi);
          return (
            <button
              key={midi}
              type="button"
              onClick={() => onKeyPress?.(midi)}
              className="absolute bottom-0 top-0 rounded-b-md border border-ebony/40 transition-colors"
              style={{
                left: `${index * whiteWidth}%`,
                width: `${whiteWidth}%`,
                backgroundColor: on ? "var(--color-primary)" : "var(--color-ivory)",
              }}
            >
              <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-ebony/60">
                {midi % 12 === 0 ? label(midi) : ""}
              </span>
            </button>
          );
        })}
        {midis
          .filter(isBlack)
          .map((midi) => {
            const whitesBefore = midis.filter((m) => m < midi && !isBlack(m)).length;
            const on = active.includes(midi);
            return (
              <button
                key={midi}
                type="button"
                onClick={() => onKeyPress?.(midi)}
                className="absolute top-0 z-10 h-[62%] rounded-b-md border border-black/60 transition-colors"
                style={{
                  left: `${whitesBefore * whiteWidth - whiteWidth * 0.3}%`,
                  width: `${whiteWidth * 0.6}%`,
                  backgroundColor: on ? "var(--color-primary)" : "var(--color-ebony)",
                }}
              />
            );
          })}
      </div>
    </div>
  );
}
