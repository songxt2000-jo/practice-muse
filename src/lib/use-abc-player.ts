import { useCallback, useEffect, useRef, useState } from "react";

type TimingEvent = {
  milliseconds: number;
  measureNumber?: number;
  startChar?: number;
  endChar?: number;
  midiPitches?: Array<{ pitch: number }>;
  elements?: any[][];
};

type Options = {
  abc: string | null;
  tempo: number;
  loop: { from: number; to: number } | null;
  linesPerPage?: number;
};

const HIGHLIGHT_CLASS = "abcjs-note_selected";

/**
 * Renders ABC notation with abcjs and drives its piano-sound playback,
 * exposing sounding MIDI pitches, the beat clock, and staff-line paging.
 */
export function useAbcPlayer({ abc, tempo, loop, linesPerPage = 4 }: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visualRef = useRef<any>(null);
  const synthRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const timingsRef = useRef<TimingEvent[]>([]);
  const totalMsRef = useRef(0);
  const loopRef = useRef(loop);
  const highlightedRef = useRef<any[]>([]);
  const groupsRef = useRef<HTMLElement[]>([]);
  const pageRef = useRef(0);
  const linesPerPageRef = useRef(linesPerPage);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useEffect(() => {
    linesPerPageRef.current = linesPerPage;
  }, [linesPerPage]);


  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeMidi, setActiveMidi] = useState<number[]>([]);
  const [measure, setMeasure] = useState(0);
  const [measureCount, setMeasureCount] = useState(0);
  const [beat, setBeat] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [page, setPageState] = useState(0);
  const [lineCount, setLineCount] = useState(0);

  const pageCount = Math.max(1, Math.ceil(lineCount / linesPerPage));

  const applyPage = useCallback((next: number) => {
    const groups = groupsRef.current;
    const container = containerRef.current;
    if (!container) return;
    const viewport = container.parentElement as HTMLElement | null;
    if (!groups.length || !viewport) {
      container.style.transform = "";
      return;
    }
    const per = linesPerPageRef.current;
    const clamped = Math.max(0, Math.min(next, Math.ceil(groups.length / per) - 1));
    pageRef.current = clamped;
    setPageState(clamped);

    const containerTop = container.getBoundingClientRect().top;
    const currentShift = Number(container.dataset['shift'] ?? "0");
    const first = groups[clamped * per]!;
    const lastIndex = Math.min(groups.length - 1, clamped * per + per - 1);
    const last = groups[lastIndex]!;
    const top = first.getBoundingClientRect().top - containerTop + currentShift;
    const bottom = last.getBoundingClientRect().bottom - containerTop + currentShift;

    container.dataset['shift'] = String(top);
    container.style.transform = `translateY(${-top}px)`;
    viewport.style.height = `${Math.max(120, bottom - top + 16)}px`;
  }, []);

  const measureLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.style.transform = "";
    container.dataset['shift'] = "0";
    const groups = Array.from(
      container.querySelectorAll<HTMLElement>(".abcjs-staff-group"),
    );
    groupsRef.current = groups;
    setLineCount(groups.length);
    applyPage(0);
  }, [applyPage]);

  const goToPage = useCallback((next: number) => applyPage(next), [applyPage]);

  const clearHighlight = useCallback(() => {
    for (const el of highlightedRef.current) el.classList?.remove(HIGHLIGHT_CLASS);
    highlightedRef.current = [];
  }, []);

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
        timingsRef.current = ((visual as any).noteTimings ?? []) as TimingEvent[];
        totalMsRef.current = (visual.getTotalTime?.() ?? 0) * 1000;
        setMeasureCount(
          timingsRef.current.reduce((max, e) => Math.max(max, (e.measureNumber ?? 0) + 1), 0),
        );
        measureLines();

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
          beatCallback: (beatNumber: number) => {
            setBeat(Math.max(0, Math.floor(beatNumber)));
          },
          eventCallback: (event: TimingEvent | null) => {
            if (!event) {
              setPlaying(false);
              setActiveMidi([]);
              clearHighlight();
              return;
            }
            setActiveMidi((event.midiPitches ?? []).map((p) => p.pitch));
            if (typeof event.measureNumber === "number") setMeasure(event.measureNumber);

            clearHighlight();
            const flat: any[] = [];
            for (const group of event.elements ?? []) for (const el of group) flat.push(el);
            for (const el of flat) el.classList?.add(HIGHLIGHT_CLASS);
            highlightedRef.current = flat;

            const anchor = flat[0] as HTMLElement | undefined;
            const group = anchor?.closest?.(".abcjs-staff-group") as HTMLElement | undefined;
            if (group) {
              const index = groupsRef.current.indexOf(group);
              if (index >= 0) {
                const target = Math.floor(index / linesPerPageRef.current);
                if (target !== pageRef.current) applyPage(target);
              }
            }

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
  }, [abc, tempo, seekToMs, measureLines, applyPage, clearHighlight]);

  useEffect(() => {
    const onResize = () => measureLines();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureLines]);

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
    clearHighlight();
  }, [clearHighlight]);

  const stop = useCallback(() => {
    synthRef.current?.stop();
    timerRef.current?.reset();
    setPlaying(false);
    setActiveMidi([]);
    clearHighlight();
    setMeasure(0);
    setBeat(0);
  }, [clearHighlight]);

  return {
    containerRef,
    ready,
    playing,
    activeMidi,
    measure,
    measureCount,
    beat,
    error,
    play,
    pause,
    stop,
    seekToMeasure,
    page,
    pageCount,
    goToPage,
  };
}
