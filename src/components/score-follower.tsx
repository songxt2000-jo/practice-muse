import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { openBookSource, type BookSource } from "@/lib/book-pages";
import { detectPage, finishLayout, type PageLayout } from "@/lib/score-layout";
import { guessPickupBeats, listMeasures, locate, playOrder } from "@/lib/score-navigation";
import { Button } from "@/components/ui/button";
import { Metronome } from "@/components/metronome";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ChevronLeft, ChevronRight, Loader2, Minus, MoreHorizontal, Pause, Play, Plus, RotateCcw, SkipBack, Square } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

/** What we keep in `pieces.score_layout`. Bump `version` when the shape changes. */
type StoredLayout = {
  version: 1;
  pages: PageLayout[];
  settings: { beatsPerMeasure: number; pickupBeats: number; countIn: boolean };
};

type PieceInfo = {
  id: string;
  book_id: string | null;
  start_page: number | null;
  end_page: number | null;
  score_layout?: unknown;
};

type Props = {
  piece: PieceInfo;
  tempo: number;
  onTempoChange: (bpm: number) => void;
  /** Tell the page when the cursor starts or stops (ballerina, pausing the synth). */
  onPlayingChange?: (playing: boolean) => void;
  /** Bump this number to stop the cursor from outside, e.g. when audio playback starts. */
  stopSignal?: number;
  /** Focus-room layout: score fills the screen, one bar of big controls underneath. */
  focus?: boolean;
  /** Reports the printed measure number under the cursor (null when idle) and the total. */
  onPosition?: (measure: number | null, total: number) => void;
};

type CoreProps = Omit<Props, "piece"> & {
  source: BookSource | undefined;
  firstPage: number;
  lastPage: number;
  initialLayout: unknown;
  onSaveLayout: (layout: StoredLayout) => void;
};

const DETECT_WIDTH = 1200;
const DISPLAY_WIDTH = 1400;
const METERS = [2, 3, 4, 6];

function readStored(value: unknown): StoredLayout | null {
  const v = value as StoredLayout | null | undefined;
  return v && v.version === 1 && Array.isArray(v.pages) ? v : null;
}

/** Loads the piece's book and keeps the detected layout on the piece row. */
export function ScoreFollower({ piece, ...rest }: Props) {
  const { text } = useLanguage();
  const queryClient = useQueryClient();
  const firstPage = piece.start_page ?? 1;
  const lastPage = piece.end_page ?? firstPage;

  const bookQuery = useQuery({
    queryKey: ["book-source", piece.book_id],
    enabled: !!piece.book_id,
    queryFn: async (): Promise<BookSource> => {
      const { data, error } = await supabase
        .from("books")
        .select("storage_path, source_type")
        .eq("id", piece.book_id!)
        .single();
      if (error || !data?.storage_path) throw new Error(text("找不到曲集文件", "Collection file not found"));
      return openBookSource(data.storage_path, data.source_type);
    },
    staleTime: Infinity,
  });

  const save = useCallback(
    async (layout: StoredLayout) => {
      // `score_layout` is a jsonb column; the shape is owned by this component.
      const { error } = await supabase
        .from("pieces")
        .update({ score_layout: layout as unknown as Json })
        .eq("id", piece.id);
      if (error) console.warn("score_layout not saved:", error.message);
      else void queryClient.invalidateQueries({ queryKey: ["piece", piece.id] });
    },
    [piece.id, queryClient],
  );

  if (!piece.book_id) return null;
  return (
    <FollowerCore
      {...rest}
      source={bookQuery.data}
      firstPage={firstPage}
      lastPage={lastPage}
      initialLayout={piece.score_layout}
      onSaveLayout={(layout) => void save(layout)}
    />
  );
}

/**
 * Silent-metronome cursor over the original score pages: measure by measure at
 * the chosen tempo, following repeats and 1st/2nd endings. No AI involved.
 */
export function FollowerCore({
  source,
  firstPage,
  lastPage,
  initialLayout,
  onSaveLayout,
  tempo,
  onTempoChange,
  onPlayingChange,
  stopSignal,
  focus = false,
  onPosition,
}: CoreProps) {
  const { text } = useLanguage();
  const onPlayingRef = useRef(onPlayingChange);
  onPlayingRef.current = onPlayingChange;
  const notify = useCallback((on: boolean) => onPlayingRef.current?.(on), []);
  const onSaveRef = useRef(onSaveLayout);
  onSaveRef.current = onSaveLayout;

  const [stored, setStored] = useState<StoredLayout | null>(() => readStored(initialLayout));
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const detectingRef = useRef(false);
  const [attempt, setAttempt] = useState(0);

  // Read the pages once and remember the result on the piece.
  useEffect(() => {
    if (stored || !source || detectingRef.current) return;
    detectingRef.current = true;
    setDetecting(true);
    setDetectError(null);
    (async () => {
      try {
        const detected = [];
        for (let p = firstPage; p <= Math.min(lastPage, source.numPages); p += 1) {
          detected.push(detectPage(p, await source.renderPageImage(p, DETECT_WIDTH)));
        }
        const pages = finishLayout(detected);
        const measures = listMeasures(pages);
        if (!measures.length) throw new Error(text("没在这几页上找到五线谱小节", "No staff measures were found on these pages"));
        const layout: StoredLayout = {
          version: 1,
          pages,
          settings: { beatsPerMeasure: 4, pickupBeats: guessPickupBeats(measures, 4), countIn: true },
        };
        setStored(layout);
        onSaveRef.current(layout);
      } catch (err) {
        setDetectError(err instanceof Error ? err.message : text("读谱面失败", "Could not read the score"));
      } finally {
        detectingRef.current = false;
        setDetecting(false);
      }
    })();
  }, [stored, source, firstPage, lastPage, attempt]);

  const settings = stored?.settings ?? { beatsPerMeasure: 4, pickupBeats: 0, countIn: true };
  const updateSettings = (patch: Partial<StoredLayout["settings"]>) => {
    if (!stored) return;
    const next = { ...stored, settings: { ...stored.settings, ...patch } };
    setStored(next);
    onSaveRef.current(next);
  };

  const measures = useMemo(() => (stored ? listMeasures(stored.pages) : []), [stored]);
  const steps = useMemo(
    () => playOrder(measures, settings.beatsPerMeasure, settings.pickupBeats),
    [measures, settings.beatsPerMeasure, settings.pickupBeats],
  );

  // Page images shown to the player, pen annotations included.
  const [images, setImages] = useState<Record<number, string>>({});
  /** Zero-based half-page in this piece: page 1 top, page 1 bottom, page 2 top… */
  const [viewHalf, setViewHalf] = useState(0);
  const halfCount = Math.max(1, (lastPage - firstPage + 1) * 2);
  const halfPage = useCallback((half: number) => firstPage + Math.floor(half / 2), [firstPage]);
  const visibleHalves = useMemo<[number, number]>(() => {
    const current = Math.max(0, Math.min(viewHalf, halfCount - 1));
    if (current % 2 === 0) return [current, Math.min(current + 1, halfCount - 1)];
    // While playing a lower half, replace the already-read upper pane with the
    // next page opening. The lower pane remains stable until it has been played.
    return current + 1 < halfCount ? [current + 1, current] : [Math.max(0, current - 1), current];
  }, [viewHalf, halfCount]);
  const neededPages = useMemo(() => {
    const pages = visibleHalves.map(halfPage);
    const followingPage = Math.max(...pages) + 1;
    if (followingPage <= lastPage) pages.push(followingPage);
    return Array.from(new Set(pages));
  }, [visibleHalves, halfPage, lastPage]);
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    for (const page of neededPages) {
      if (images[page]) continue;
      source.renderPage(page, DISPLAY_WIDTH).then((url) => {
        if (!cancelled) setImages((prev) => ({ ...prev, [page]: url }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [source, neededPages, images]);

  // ---- clock ----
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [startStep, setStartStep] = useState(0);
  const anchorRef = useRef({ time: 0, beat: 0 });
  const frameRef = useRef<number | null>(null);
  const tempoRef = useRef(tempo);

  const rewind = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setPlaying(false);
    notify(false);
    setStartStep(0);
    setBeat(steps[0]?.startBeat ?? 0);
    setViewHalf(0);
  }, [notify, steps]);

  // Keep the cursor in place when the tempo changes mid-play.
  useEffect(() => {
    const now = performance.now();
    const a = anchorRef.current;
    anchorRef.current = { time: now, beat: a.beat + ((now - a.time) * tempoRef.current) / 60000 };
    tempoRef.current = tempo;
  }, [tempo]);

  const endBeat = steps.length ? steps[steps.length - 1]!.startBeat + steps[steps.length - 1]!.beats : 0;

  const play = useCallback(
    (fromStep: number) => {
      const first = steps[fromStep];
      if (!first) return;
      const lead = settings.countIn ? settings.beatsPerMeasure : 0;
      anchorRef.current = { time: performance.now(), beat: first.startBeat - lead };
      setStartStep(fromStep);
      setPlaying(true);
      notify(true);
      const tick = (now: number) => {
        const a = anchorRef.current;
        const b = a.beat + ((now - a.time) * tempoRef.current) / 60000;
        if (b >= endBeat) {
          setBeat(endBeat);
          frameRef.current = null;
          setPlaying(false);
          notify(false);
          return;
        }
        setBeat(b);
        frameRef.current = requestAnimationFrame(tick);
      };
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(tick);
    },
    [steps, settings.countIn, settings.beatsPerMeasure, endBeat, notify],
  );

  const pause = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setPlaying(false);
    notify(false);
  }, [notify]);

  const resume = useCallback(() => {
    const here = locate(steps, Math.max(beat, steps[0]?.startBeat ?? 0));
    play(here ? here.step : startStep);
  }, [steps, beat, play, startStep]);

  const pauseRef = useRef(pause);
  pauseRef.current = pause;
  useEffect(() => {
    if (stopSignal) pauseRef.current();
  }, [stopSignal]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  // ---- where are we ----
  const counting = playing && steps.length > 0 && beat < steps[startStep]!.startBeat;
  const here = counting ? null : locate(steps, beat);
  const step = here ? steps[here.step] : undefined;
  const measure = step ? measures[step.measure] : undefined;
  const beatInMeasure = counting
    ? Math.floor(beat - (steps[startStep]!.startBeat - settings.beatsPerMeasure))
    : step
      ? Math.floor(beat - step.startBeat)
      : -1;

  const measureHalf = useCallback(
    (m: (typeof measures)[number]) => (m.page - firstPage) * 2 + ((m.top + m.bottom) / 2 >= 0.5 ? 1 : 0),
    [firstPage],
  );

  // Follow by half-pages. As soon as the cursor enters a lower half, the upper
  // pane reveals the next page opening, several systems before it is needed.
  useEffect(() => {
    if (playing && measure) {
      const target = measureHalf(measure);
      if (target !== viewHalf) setViewHalf(target);
    }
    if (counting) {
      const target = measures[steps[startStep]!.measure];
      if (target) {
        const targetHalf = measureHalf(target);
        if (targetHalf !== viewHalf) setViewHalf(targetHalf);
      }
    }
  }, [playing, measure, viewHalf, counting, measures, steps, startStep, measureHalf]);

  const pickupShown = settings.pickupBeats > 0;
  const printedNumber = (index: number) => (pickupShown ? index : index + 1);

  const totalPrinted = pickupShown ? Math.max(0, measures.length - 1) : measures.length;
  const shownMeasure = !counting && measure ? printedNumber(measure.index) : null;
  useEffect(() => {
    onPosition?.(shownMeasure, totalPrinted);
  }, [onPosition, shownMeasure, totalPrinted]);
  const [moreOpen, setMoreOpen] = useState(false);

  const jumpTo = (measureIndex: number) => {
    const s = steps.findIndex((st) => st.measure === measureIndex);
    if (s < 0) return;
    setStartStep(s);
    setBeat(steps[s]!.startBeat);
    if (playing) play(s);
  };

  // ---- render ----
  const sheet = (
    <div className={focus ? "relative overflow-hidden rounded-md bg-[var(--fr-paper)] shadow-[0_1px_2px_rgba(30,42,50,.08),0_12px_32px_rgba(30,42,50,.08)]" : "score-sheet relative mt-4 overflow-hidden rounded-lg"}>
        <div className="grid gap-px bg-border">
          {visibleHalves.map((half, slot) => {
            const page = halfPage(half);
            const lower = half % 2 === 1;
            const pageLayout = stored?.pages.find((item) => item.page === page);
            const halfMeasures = measures.filter(
              (m) => m.page === page && ((m.top + m.bottom) / 2 >= 0.5) === lower,
            );
            return (
              <div
                key={`${slot}-${half}`}
                className="relative overflow-hidden bg-score"
                style={{ aspectRatio: pageLayout ? `${2 / pageLayout.aspect}` : "1.42" }}
              >
                {images[page] ? (
                  <img
                    src={images[page]}
                    alt={text(`第 ${page} 页${lower ? "下半页" : "上半页"}`, `Page ${page}, ${lower ? "lower" : "upper"} half`)}
                    className="absolute left-0 w-full max-w-none select-none"
                    style={{ top: lower ? "-100%" : "0" }}
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 !size-4 animate-spin" /> {text(`正在打开第 ${page} 页…`, `Opening page ${page}…`)}
                  </div>
                )}

                {images[page] && pageLayout && (
                  <div className="absolute inset-0">
                    {halfMeasures.map((m) => {
                      const pad = (m.bottom - m.top) * 0.18;
                      const active = measure?.index === m.index;
                      return (
                        <button
                          key={m.index}
                          type="button"
                          onClick={() => jumpTo(m.index)}
                          title={text(`从第 ${printedNumber(m.index)} 小节开始`, `Start from measure ${printedNumber(m.index)}`)}
                          className={`absolute rounded-sm transition-colors ${active ? "bg-amber-400/20" : "hover:bg-amber-400/10"}`}
                          style={{
                            left: `${m.left * 100}%`,
                            width: `${(m.right - m.left) * 100}%`,
                            top: `${((m.top - (lower ? 0.5 : 0)) - pad) * 200}%`,
                            height: `${(m.bottom - m.top + pad * 2) * 200}%`,
                          }}
                        />
                      );
                    })}
                    {measure && here && measureHalf(measure) === half && (
                      <div
                        className="pointer-events-none absolute w-[3px] rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                        style={{
                          left: `${(measure.left + (measure.right - measure.left) * here.progress) * 100}%`,
                          top: `${((measure.top - (lower ? 0.5 : 0)) - (measure.bottom - measure.top) * 0.12) * 200}%`,
                          height: `${(measure.bottom - measure.top) * 1.24 * 200}%`,
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {(detecting || detectError) && (
          <div className="absolute inset-x-0 bottom-0 bg-background/85 p-3 text-center text-sm">
            {detecting ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {text("正在找小节线…", "Finding bar lines…")}
              </span>
            ) : (
              <span className="text-destructive">{detectError}</span>
            )}
          </div>
        )}
      </div>

  );

  const settingsPanel = (
    <div className={focus ? "flex flex-wrap items-center gap-x-6 gap-y-3 text-sm" : "mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4 text-sm"}>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{text("每小节", "Meter")}</span>
          {METERS.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={settings.beatsPerMeasure === n ? "default" : "secondary"}
              disabled={!stored || playing}
              onClick={() =>
                updateSettings({ beatsPerMeasure: n, pickupBeats: Math.min(settings.pickupBeats, n - 1) })
              }
            >
              {n}
            </Button>
          ))}
          <span className="text-muted-foreground">{text("拍", "beats")}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{text("弱起", "Pickup")}</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={!stored || playing || settings.pickupBeats <= 0}
            onClick={() => updateSettings({ pickupBeats: settings.pickupBeats - 1 })}
          >
            −
          </Button>
          <span className="w-14 text-center tabular-nums">
            {settings.pickupBeats ? text(`${settings.pickupBeats} 拍`, `${settings.pickupBeats} beats`) : text("没有", "None")}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={!stored || playing || settings.pickupBeats >= settings.beatsPerMeasure - 1}
            onClick={() => updateSettings({ pickupBeats: settings.pickupBeats + 1 })}
          >
            +
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="count-in"
            checked={settings.countIn}
            disabled={!stored}
            onCheckedChange={(on) => updateSettings({ countIn: on })}
          />
          <Label htmlFor="count-in">{text("先数一小节预备拍", "Count in one measure")}</Label>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={detecting || playing}
          onClick={() => {
            setStored(null);
            setDetectError(null);
            setStartStep(0);
            setBeat(0);
            setAttempt((n) => n + 1);
          }}
          title={text("重新识别这几页的小节线", "Detect bar lines again")}
        >
          <RotateCcw className="size-4" />
          {text("重新找小节线", "Detect bar lines")}
        </Button>
      </div>
  );

  const beatDots = (
        <div className="flex items-center gap-1.5" aria-label={text("拍点", "Beats")}>
          {Array.from({ length: settings.beatsPerMeasure }, (_, i) => (
            <span
              key={i}
              className={`size-3 rounded-full border transition-colors ${
                i === beatInMeasure
                  ? counting
                    ? "border-sky-400 bg-sky-400"
                    : i === 0
                      ? "border-amber-400 bg-amber-400"
                      : "border-amber-300 bg-amber-300/80"
                  : "border-border bg-transparent"
              }`}
            />
          ))}
        </div>
  );

  if (focus) {
    const nudge = (d: number) => onTempoChange(Math.min(208, Math.max(40, tempo + d)));
    const round = "flex size-12 shrink-0 items-center justify-center rounded-full border border-[var(--fr-line)] bg-[var(--fr-paper)] text-[var(--fr-ink)] disabled:opacity-40";
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-3xl">{sheet}</div>
          {halfCount > 1 && !playing && (
            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-[var(--fr-muted)]">
              <button type="button" className={round} disabled={viewHalf <= 0} onClick={() => setViewHalf((half) => Math.max(0, half - 1))} aria-label={text("上半页", "Previous half page")}>
                <ChevronLeft className="size-5" />
              </button>
              {text(`第 ${halfPage(viewHalf)} 页${viewHalf % 2 ? "下半" : "上半"}`, `Page ${halfPage(viewHalf)}, ${viewHalf % 2 ? "lower" : "upper"} half`)}
              <button type="button" className={round} disabled={viewHalf >= halfCount - 1} onClick={() => setViewHalf((half) => Math.min(halfCount - 1, half + 1))} aria-label={text("下半页", "Next half page")}>
                <ChevronRight className="size-5" />
              </button>
            </div>
          )}
        </div>

        {moreOpen && (
          <div className="border-t border-[var(--fr-line)] bg-[var(--fr-bar)] px-6 py-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              <Metronome
                bpm={tempo}
                beatsPerBar={settings.beatsPerMeasure}
                syncBeat={Math.floor(beat)}
                syncing={playing}
                forceSound={counting}
              />
              {settingsPanel}
            </div>
          </div>
        )}

        <footer className="flex items-center gap-5 border-t border-[var(--fr-line)] bg-[var(--fr-bar)] px-6 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={() => (playing ? pause() : resume())}
            disabled={!steps.length}
            aria-label={playing ? text("暂停", "Pause") : text("开始", "Start")}
            className="flex size-[76px] shrink-0 items-center justify-center rounded-full bg-[var(--fr-ink)] text-[var(--fr-gold)] disabled:opacity-40"
          >
            {playing ? <Pause className="size-7 fill-current" /> : <Play className="ml-1 size-7 fill-current" />}
          </button>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--fr-muted)]">{text("速度", "Tempo")}</span>
            <div className="flex items-center gap-1">
              <button type="button" className={round} onClick={() => nudge(-2)} aria-label={text("减慢", "Slower")}>
                <Minus className="size-5" />
              </button>
              <span className="w-16 text-center text-2xl font-semibold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                ♩{tempo}
              </span>
              <button type="button" className={round} onClick={() => nudge(2)} aria-label={text("加快", "Faster")}>
                <Plus className="size-5" />
              </button>
            </div>
          </div>

          <div className="hidden sm:block">{beatDots}</div>
          <div className="flex-1" />

          <button type="button" className={round} onClick={rewind} disabled={!steps.length} aria-label={text("回到起点", "Restart")}>
            <SkipBack className="size-5" />
          </button>
          <button
            type="button"
            className={round}
            onClick={() => setMoreOpen((on) => !on)}
            aria-expanded={moreOpen}
            aria-label={text("更多设置", "More settings")}
          >
            <MoreHorizontal className="size-5" />
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="surface-salon mt-6 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg" style={{ fontFamily: "var(--font-display)" }}>
          {text("原谱跟随", "Follow original")}
        </span>
        <span className="text-xs text-muted-foreground">
          {text("光标按拍子走在你的原谱上，不用 AI", "A beat-synced cursor follows your original score without AI")}
        </span>
      </div>

      {sheet}

      {halfCount > 1 && (
        <div className="mt-2 flex items-center justify-center gap-3">
          <Button variant="ghost" size="sm" disabled={viewHalf <= 0 || playing} onClick={() => setViewHalf((half) => Math.max(0, half - 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {text(`第 ${halfPage(viewHalf)} 页${viewHalf % 2 ? "下半页" : "上半页"} · 半页预翻`, `Page ${halfPage(viewHalf)}, ${viewHalf % 2 ? "lower" : "upper"} half · preview turn`)}
          </span>
          <Button variant="ghost" size="sm" disabled={viewHalf >= halfCount - 1 || playing} onClick={() => setViewHalf((half) => Math.min(halfCount - 1, half + 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => (playing ? pause() : resume())} disabled={!steps.length}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? text("暂停", "Pause") : text("开始", "Start")}
        </Button>
        <Button variant="secondary" onClick={rewind} disabled={!steps.length}>
          <Square className="size-4" />
          {text("回到起点", "Restart")}
        </Button>

        <Metronome
          bpm={tempo}
          beatsPerBar={settings.beatsPerMeasure}
          syncBeat={Math.floor(beat)}
          syncing={playing}
          forceSound={counting}
        />

        {beatDots}
        <span className="text-xs tabular-nums text-muted-foreground">
          {counting
            ? text("预备拍…", "Count-in…")
            : measure
              ? text(`第 ${printedNumber(measure.index)} 小节${measure.volta ? `（第 ${measure.volta} 房子）` : ""}`, `Measure ${printedNumber(measure.index)}${measure.volta ? ` (ending ${measure.volta})` : ""}`)
              : text(`${tempo} BPM · 点谱面上任意小节从那里开始`, `${tempo} BPM · Select any measure to start there`)}
        </span>
      </div>

      <div className="mt-4 max-w-md">
        <div className="flex items-center justify-between text-sm">
          <span>{text("速度", "Tempo")}</span>
          <span className="tabular-nums text-primary">{tempo} BPM</span>
        </div>
        <Slider
          className="mt-3"
          min={40}
          max={208}
          step={1}
          value={[tempo]}
          onValueChange={([value]) => onTempoChange(value ?? 90)}
        />
      </div>

      {settingsPanel}
    </div>
  );
}
