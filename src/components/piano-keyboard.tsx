import { useEffect, useRef } from "react";
import { useLanguage } from "@/lib/i18n";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FIRST_MIDI = 36; // C2
const LAST_MIDI = 96; // C7
const INITIAL_MIDI = 48; // C3
const WHITE_KEY_WIDTH = 36;

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
  const { text } = useLanguage();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const midis: number[] = [];
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m += 1) midis.push(m);
  const whites = midis.filter((m) => !isBlack(m));
  const keyboardWidth = whites.length * WHITE_KEY_WIDTH;

  useEffect(() => {
    const viewport = scrollRef.current;
    const initialKey = viewport?.querySelector<HTMLElement>(`[data-midi="${INITIAL_MIDI}"]`);
    if (!viewport || !initialKey) return;
    viewport.scrollLeft = Math.max(0, initialKey.offsetLeft - 12);
  }, []);

  useEffect(() => {
    const viewport = scrollRef.current;
    const soundingMidi = active.find((midi) => midi >= FIRST_MIDI && midi <= LAST_MIDI);
    if (!viewport || soundingMidi === undefined) return;

    const key = viewport.querySelector<HTMLElement>(`[data-midi="${soundingMidi}"]`);
    if (!key) return;

    const viewportRect = viewport.getBoundingClientRect();
    const keyRect = key.getBoundingClientRect();
    const edgePadding = 32;
    const outsideLeft = keyRect.left < viewportRect.left + edgePadding;
    const outsideRight = keyRect.right > viewportRect.right - edgePadding;

    if (outsideLeft || outsideRight) {
      viewport.scrollTo({
        left: key.offsetLeft - viewport.clientWidth / 2 + key.offsetWidth / 2,
        behavior: "smooth",
      });
    }
  }, [active]);

  return (
    <div
      ref={scrollRef}
      className="h-32 w-full select-none overflow-x-auto overscroll-x-contain rounded-lg bg-ebony p-2 shadow-key"
      aria-label={text("C2 到 C7 可横向滑动钢琴键盘", "Scrollable piano keyboard from C2 to C7")}
    >
      <div className="relative h-full" style={{ width: `${keyboardWidth}px` }}>
        {whites.map((midi, index) => {
          const on = active.includes(midi);
          return (
            <button
              key={midi}
              data-midi={midi}
              type="button"
              aria-label={label(midi)}
              onClick={() => onKeyPress?.(midi)}
              className="absolute bottom-0 top-0 rounded-b-md border border-ebony/40 transition-colors"
              style={{
                left: `${index * WHITE_KEY_WIDTH}px`,
                width: `${WHITE_KEY_WIDTH}px`,
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
                data-midi={midi}
                type="button"
                aria-label={label(midi)}
                onClick={() => onKeyPress?.(midi)}
                className="absolute top-0 z-10 h-[62%] rounded-b-md border border-black/60 transition-colors"
                style={{
                  left: `${whitesBefore * WHITE_KEY_WIDTH - WHITE_KEY_WIDTH * 0.3}px`,
                  width: `${WHITE_KEY_WIDTH * 0.6}px`,
                  backgroundColor: on ? "var(--color-primary)" : "var(--color-ebony)",
                }}
              />
            );
          })}
      </div>
    </div>
  );
}
