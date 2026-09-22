import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Timer } from "lucide-react";

export function Metronome({ bpm, beatsPerBar = 4 }: { bpm: number; beatsPerBar?: number }) {
  const [on, setOn] = useState(false);
  const [beat, setBeat] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!on) {
      setBeat(0);
      return;
    }
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    void ctx.resume();

    let index = 0;
    const click = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = index % beatsPerBar === 0 ? 1600 : 1000;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
      setBeat(index % beatsPerBar);
      index += 1;
    };

    click();
    const id = setInterval(click, (60 / bpm) * 1000);
    return () => clearInterval(id);
  }, [on, bpm, beatsPerBar]);

  return (
    <div className="flex items-center gap-3">
      <Button variant={on ? "default" : "secondary"} size="sm" onClick={() => setOn(!on)}>
        <Timer className="size-4" />
        节拍器 {on ? "开" : "关"}
      </Button>
      <div className="flex gap-1">
        {Array.from({ length: beatsPerBar }).map((_, index) => (
          <span
            key={index}
            className="size-2 rounded-full transition-colors"
            style={{
              backgroundColor:
                on && beat === index ? "var(--color-primary)" : "var(--color-border)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
