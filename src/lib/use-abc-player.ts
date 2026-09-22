import { useCallback, useEffect, useRef, useState } from "react";

type TimingEvent = {
  milliseconds: number;
  measureNumber?: number;
  startChar?: number;
  endChar?: number;
  midiPitches?: Array<{ pitch: number }>;
};

type Options = {
  abc: string | null;
  tempo: number;
  loop: { from: number; to: number } | null;
};

/**
 * Renders ABC notation with abcjs and drives its piano-sound playback,
 * exposing the currently sounding MIDI pitches and measure for the UI.
 */
export function useAbcPlayer({ abc, tempo, loop }: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visualRef = useRef<any>(null);
  const synthRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const timingsRef = useRef<TimingEvent[]>([]);
  const totalMsRef = useRef(0);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeMidi, setActiveMidi] = useState<number[]>([]);
  const [measure, setMeasure] = useState(0);
  const [measureCount, setMeasureCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const seekFraction = useCallback((fraction: number) => {
    const clamped = Math.min(0.999, Math.max(0, fraction));
    synthRef.current?.seek(clamped);
    timerRef.current?.setProgress(clamped);
  }, []);

  const seekToMs = useCallback(
    (ms: number) => {
      if (!totalMsRef.current) return;
      seekFraction(ms / totalMsRef.current);
    },
    [seekFraction],
  );

  const seekToMeasure = useCallback(
    (measureNumber: number) => {
      const event = timingsRef.current.find((e) => (e.measureNumber ?? 0) >= measureNumber);
      seekToMs(event?.milliseconds ?? 0);
    },
    [seekToMs],
  );

  useEffect(() => {
    if (!abc || !containerRef.current) return;
    let disposed = false;
    setReady(false);
    setError(null);

    (async () => {
      const abcjs = (await import("abcjs")).default;
      if (disposed || !containerRef.current) return;

      try {
        const visual = abcjs.renderAbc(containerRef.current, abc, {
          responsive: "resize",
          add_classes: true,
          staffwidth: 900,
          clickListener: (abcElem: any) => {
            const start = abcElem?.startChar;
            if (typeof start !== "number") return;
            const hit = timingsRef.current.find(
              (e) => (e.startChar ?? -1) <= start && start <= (e.endChar ?? -1),
            );
            if (hit) seekToMs(hit.milliseconds);
          },
        })[0];
        visualRef.current = visual;

        visual.setTiming(tempo, 0);
        timingsRef.current = (visual.noteTimings ?? []) as TimingEvent[];
        totalMsRef.current = (visual.getTotalTime?.() ?? 0) * 1000;
        setMeasureCount(
          timingsRef.current.reduce((max, e) => Math.max(max, (e.measureNumber ?? 0) + 1), 0),
        );

        const synth = new abcjs.synth.CreateSynth();
        await synth.init({
          visualObj: visual,
          millisecondsPerMeasure: visual.millisecondsPerMeasure(tempo),
          options: { program: 0, chordsOff: false },
        });
        await synth.prime();
        if (disposed) return;
        synthRef.current = synth;

        timerRef.current = new abcjs.TimingCallbacks(visual, {
          qpm: tempo,
          extraMeasuresAtBeginning: 0,
          eventCallback: (event: TimingEvent | null) => {
            if (!event) {
              setPlaying(false);
              setActiveMidi([]);
              return;
            }
            setActiveMidi((event.midiPitches ?? []).map((p) => p.pitch));
            if (typeof event.measureNumber === "number") setMeasure(event.measureNumber);
            const active = loopRef.current;
            if (active && typeof event.measureNumber === "number") {
              if (event.measureNumber > active.to) {
                const target = timingsRef.current.find(
                  (e) => (e.measureNumber ?? 0) >= active.from,
                );
                seekToMs(target?.milliseconds ?? 0);
              }
            }
          },
        });
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "乐谱渲染失败");
      }
    })();

    return () => {
      disposed = true;
      try {
        timerRef.current?.stop();
        synthRef.current?.stop();
      } catch {
        /* noop */
      }
      timerRef.current = null;
      synthRef.current = null;
    };
  }, [abc, tempo, seekToMs]);

  const play = useCallback(async () => {
    if (!synthRef.current) return;
    await synthRef.current.resume?.();
    synthRef.current.start();
    timerRef.current?.start();
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    synthRef.current?.pause();
    timerRef.current?.pause();
    setPlaying(false);
    setActiveMidi([]);
  }, []);

  const stop = useCallback(() => {
    synthRef.current?.stop();
    timerRef.current?.reset();
    setPlaying(false);
    setActiveMidi([]);
    setMeasure(0);
  }, []);

  return {
    containerRef,
    ready,
    playing,
    activeMidi,
    measure,
    measureCount,
    error,
    play,
    pause,
    stop,
    seekToMeasure,
  };
}
