import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Timer } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

function useClicker() {
  const ctxRef = useRef<AudioContext | null>(null);
  return (accent: boolean) => {
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  };
}

export function Metronome({
  bpm,
  beatsPerBar = 4,
  syncBeat = null,
  syncing = false,
  forceSound = false,
}: {
  bpm: number;
  beatsPerBar?: number;
  /** Beat counter coming from the score playback, used when syncing. */
  syncBeat?: number | null;
  /** True while the score is playing, so the metronome follows it. */
  syncing?: boolean;
  /** Sound synced beats even while the metronome toggle is off (for count-in). */
  forceSound?: boolean;
}) {
  const { text } = useLanguage();
  const [on, setOn] = useState(false);
  const [beat, setBeat] = useState(0);
  const click = useClicker();
  const clickRef = useRef(click);
  clickRef.current = click;

  // Free-running metronome: only when the score is not playing.
  useEffect(() => {
    if (!on || syncing) {
      if (!on) setBeat(0);
      return;
    }
    let index = 0;
    const tick = () => {
      clickRef.current(index % beatsPerBar === 0);
      setBeat(index % beatsPerBar);
      index += 1;
    };
    tick();
    const id = setInterval(tick, (60 / bpm) * 1000);
    return () => clearInterval(id);
  }, [on, syncing, bpm, beatsPerBar]);

  // Locked to the playing score's beat clock.
  useEffect(() => {
    if ((!on && !forceSound) || !syncing || syncBeat === null) return;
    const position = ((syncBeat % beatsPerBar) + beatsPerBar) % beatsPerBar;
    clickRef.current(position === 0);
    setBeat(position);
  }, [on, forceSound, syncing, syncBeat, beatsPerBar]);

  return (
    <div className="flex items-center gap-3">
      <Button variant={on ? "default" : "secondary"} size="sm" onClick={() => setOn(!on)}>
        <Timer className="size-4" />
        {text("节拍器", "Metronome")} {on ? (syncing ? text("跟随乐曲", "Synced") : text("开", "On")) : text("关", "Off")}
      </Button>
      <div className="flex gap-1">
        {Array.from({ length: beatsPerBar }).map((_, index) => (
          <span
            key={index}
            className="size-2 rounded-full transition-colors"
            style={{
              backgroundColor:
                (on || forceSound) && beat === index ? "var(--color-primary)" : "var(--color-border)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
