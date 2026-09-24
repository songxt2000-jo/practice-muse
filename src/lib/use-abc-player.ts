import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";

type TimingEvent = {
  milliseconds: number;
  measureNumber?: number;
  startChar?: number;
  endChar?: number;
  midiPitches?: Array<{ pitch: number }>;
  elements?: any[][];
};

export type NoteClickInfo = {
  startChar: number;
  endChar: number;
  text: string;
  midiPitches: number[];
};

type Options = {
  abc: string | null;
  tempo: number;
  loop: { from: number; to: number } | null;
  linesPerPage?: number;
  /** Return true to consume the click (edit mode) instead of seeking there. */
  onNoteClick?: (info: NoteClickInfo) => boolean | void;
};

const HIGHLIGHT_CLASS = "abcjs-note_selected";

/**
 * Renders ABC notation with abcjs and drives its piano-sound playback,
 * exposing sounding MIDI pitches, the beat clock, and staff-line paging.
 */
export function useAbcPlayer({ abc, tempo, loop, linesPerPage = 4, onNoteClick }: Options) {
  const { text } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The score container is mounted/unmounted by mode switches, so track it as
  // state: the render effect below must re-run when the element appears.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const setContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    setContainerEl(el);
  }, []);
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
  const abcRef = useRef(abc);
  const clickRef = useRef(onNoteClick);
  const playingRef = useRef(false);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useEffect(() => {
    linesPerPageRef.current = linesPerPage;
  }, [linesPerPage]);

  useEffect(() => {
    abcRef.current = abc;
    clickRef.current = onNoteClick;
  }, [abc, onNoteClick]);



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

    // Lines and container share the same transform (even mid-transition), so
    // their rect difference is the untransformed layout offset.
    const containerTop = container.getBoundingClientRect().top;
    const first = groups[clamped * per]!;
    const lastIndex = Math.min(groups.length - 1, clamped * per + per - 1);
    const last = groups[lastIndex]!;
    const top = first.getBoundingClientRect().top - containerTop;
    const bottom = last.getBoundingClientRect().bottom - containerTop;
    if (!first.isConnected || bottom - top <= 0) return;

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
      container.querySelectorAll<HTMLElement>(".abcjs-staff-wrapper"),
    );
    groupsRef.current = groups;
    setLineCount(groups.length);
    requestAnimationFrame(() => requestAnimationFrame(() => applyPage(pageRef.current)));
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
    if (!abc || !containerEl) return;
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
            const end = abcElem?.endChar;
            if (typeof start !== "number") return;

            const handler = clickRef.current;
            if (handler && typeof end === "number" && end > start) {
              const handled = handler({
                startChar: start,
                endChar: end,
                text: (abcRef.current ?? "").slice(start, end),
                midiPitches: (abcElem?.midiPitches ?? []).map((p: any) => p.pitch),
              });
              if (handled) return;
            }

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
              playingRef.current = false;
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
            const group = anchor?.closest?.(".abcjs-staff-wrapper") as HTMLElement | undefined;
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
        setError(err instanceof Error ? err.message : text("乐谱渲染失败", "Could not render the score"));
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
      playingRef.current = false;
      setPlaying(false);
    };
  }, [abc, tempo, containerEl, seekToMs, measureLines, applyPage, clearHighlight, text]);

  useEffect(() => {
    // Re-measure pages whenever the score's width changes (window resize,
    // entering/leaving fullscreen focus mode). A late second pass catches
    // abcjs's own responsive re-layout finishing after the size change.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastWidth = -1;
    const remeasure = () => {
      measureLines();
      clearTimeout(timer);
      timer = setTimeout(measureLines, 300);
    };
    const observer =
      containerEl && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            const width = Math.round(entries[0]?.contentRect.width ?? 0);
            if (width === lastWidth) return;
            lastWidth = width;
            remeasure();
          })
        : null;
    const target = containerEl?.parentElement;
    if (observer && target) observer.observe(target);
    window.addEventListener("resize", remeasure);
    document.addEventListener("fullscreenchange", remeasure);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", remeasure);
      document.removeEventListener("fullscreenchange", remeasure);
    };
  }, [measureLines, containerEl]);

  const play = useCallback(async () => {
    if (!synthRef.current || playingRef.current) return;
    playingRef.current = true;
    // Cancel any stray animation loop before starting a fresh one, otherwise
    // a second loop keeps moving keys/highlights after pause silences audio.
    try {
      timerRef.current?.pause();
    } catch {
      /* noop */
    }
    // `start()` already resumes from the paused position — calling resume()
    // as well kicks off a second overlapping voice that pause() can't stop.
    synthRef.current.start();
    timerRef.current?.start();
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    playingRef.current = false;
    try {
      synthRef.current?.pause();
    } catch {
      synthRef.current?.stop();
    }
    try {
      timerRef.current?.pause();
    } catch {
      /* noop */
    }
    setPlaying(false);
    setActiveMidi([]);
    clearHighlight();
    // A callback already queued for this frame may re-highlight; clear again.
    requestAnimationFrame(() => {
      if (playingRef.current) return;
      setActiveMidi([]);
      clearHighlight();
    });
  }, [clearHighlight]);

  const stop = useCallback(() => {
    playingRef.current = false;
    try {
      synthRef.current?.stop();
    } catch {
      /* noop */
    }
    try {
      timerRef.current?.stop();
      timerRef.current?.reset();
      timerRef.current?.pause();
    } catch {
      /* noop */
    }
    synthRef.current?.seek?.(0);
    applyPage(0);
    setPlaying(false);
    setActiveMidi([]);
    clearHighlight();
    setMeasure(0);
    setBeat(0);
  }, [clearHighlight]);

  return {
    containerRef: setContainer,
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
