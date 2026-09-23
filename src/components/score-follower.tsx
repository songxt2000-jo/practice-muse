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
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, RotateCcw, Square } from "lucide-react";

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
      if (error || !data?.storage_path) throw new Error("找不到曲集文件");
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
}: CoreProps) {
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
        if (!measures.length) throw new Error("没在这几页上找到五线谱小节");
        const layout: StoredLayout = {
          version: 1,
          pages,
          settings: { beatsPerMeasure: 4, pickupBeats: guessPickupBeats(measures, 4), countIn: true },
        };
        setStored(layout);
        onSaveRef.current(layout);
      } catch (err) {
        setDetectError(err instanceof Error ? err.message : "读谱面失败");
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
  const [viewPage, setViewPage] = useState(firstPage);
  useEffect(() => {
    if (!source || images[viewPage]) return;
    let cancelled = false;
    source.renderPage(viewPage, DISPLAY_WIDTH).then((url) => {
      if (!cancelled) setImages((prev) => ({ ...prev, [viewPage]: url }));
    });
    return () => {
      cancelled = true;
    };
  }, [source, viewPage, images]);

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

  // Follow the cursor across pages while playing.
  useEffect(() => {
    if (playing && measure && measure.page !== viewPage) setViewPage(measure.page);
    if (counting) {
      const target = measures[steps[startStep]!.measure];
      if (target && target.page !== viewPage) setViewPage(target.page);
    }
  }, [playing, measure, viewPage, counting, measures, steps, startStep]);

  const pageLayout = stored?.pages.find((p) => p.page === viewPage);
  const pageMeasures = measures.filter((m) => m.page === viewPage);
  const pickupShown = settings.pickupBeats > 0;
  const printedNumber = (index: number) => (pickupShown ? index : index + 1);

  const jumpTo = (measureIndex: number) => {
    const s = steps.findIndex((st) => st.measure === measureIndex);
    if (s < 0) return;
    setStartStep(s);
    setBeat(steps[s]!.startBeat);
    if (playing) play(s);
  };

  // ---- render ----
  return (
    <div className="surface-salon mt-6 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg" style={{ fontFamily: "var(--font-display)" }}>
          原谱跟随
        </span>
        <span className="text-xs text-muted-foreground">
          光标按拍子走在你的原谱上，不出声，不用 AI
        </span>
      </div>

      <div className="score-sheet relative mt-4 overflow-hidden rounded-lg">
        {images[viewPage] ? (
          <img src={images[viewPage]} alt={`第 ${viewPage} 页`} className="block w-full select-none" draggable={false} />
        ) : (
          <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> 正在打开第 {viewPage} 页…
          </div>
        )}

        {images[viewPage] && pageLayout && (
          <div className="absolute inset-0">
            {pageMeasures.map((m) => {
              const pad = (m.bottom - m.top) * 0.18;
              const active = measure?.index === m.index;
              return (
                <button
                  key={m.index}
                  type="button"
                  onClick={() => jumpTo(m.index)}
                  title={`从第 ${printedNumber(m.index)} 小节开始`}
                  className={`absolute rounded-sm transition-colors ${
                    active ? "bg-amber-400/20" : "hover:bg-amber-400/10"
                  }`}
                  style={{
                    left: `${m.left * 100}%`,
                    width: `${(m.right - m.left) * 100}%`,
                    top: `${(m.top - pad) * 100}%`,
                    height: `${(m.bottom - m.top + pad * 2) * 100}%`,
                  }}
                />
              );
            })}
            {measure && here && measure.page === viewPage && (
              <div
                className="pointer-events-none absolute w-[3px] rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                style={{
                  left: `${(measure.left + (measure.right - measure.left) * here.progress) * 100}%`,
                  top: `${(measure.top - (measure.bottom - measure.top) * 0.12) * 100}%`,
                  height: `${(measure.bottom - measure.top) * 1.24 * 100}%`,
                }}
              />
            )}
          </div>
        )}

        {(detecting || detectError) && (
          <div className="absolute inset-x-0 bottom-0 bg-background/85 p-3 text-center text-sm">
            {detecting ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> 正在找小节线…
              </span>
            ) : (
              <span className="text-destructive">{detectError}</span>
            )}
          </div>
        )}
      </div>

      {lastPage > firstPage && (
        <div className="mt-2 flex items-center justify-center gap-3">
          <Button variant="ghost" size="sm" disabled={viewPage <= firstPage || playing} onClick={() => setViewPage(viewPage - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            第 {viewPage} 页 · 共 {firstPage}–{lastPage} 页
          </span>
          <Button variant="ghost" size="sm" disabled={viewPage >= lastPage || playing} onClick={() => setViewPage(viewPage + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => (playing ? pause() : resume())} disabled={!steps.length}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? "暂停" : "开始"}
        </Button>
        <Button variant="secondary" onClick={rewind} disabled={!steps.length}>
          <Square className="size-4" />
          回到起点
        </Button>

        <div className="flex items-center gap-1.5" aria-label="拍点">
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
        <span className="text-xs tabular-nums text-muted-foreground">
          {counting
            ? "预备拍…"
            : measure
              ? `第 ${printedNumber(measure.index)} 小节${measure.volta ? `（第 ${measure.volta} 房子）` : ""}`
              : `${tempo} BPM · 点谱面上任意小节从那里开始`}
        </span>
      </div>

      <div className="mt-4 max-w-md">
        <div className="flex items-center justify-between text-sm">
          <span>速度</span>
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

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">每小节</span>
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
          <span className="text-muted-foreground">拍</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">弱起</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={!stored || playing || settings.pickupBeats <= 0}
            onClick={() => updateSettings({ pickupBeats: settings.pickupBeats - 1 })}
          >
            −
          </Button>
          <span className="w-14 text-center tabular-nums">
            {settings.pickupBeats ? `${settings.pickupBeats} 拍` : "没有"}
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
          <Label htmlFor="count-in">先数一小节预备拍</Label>
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
          title="重新识别这几页的小节线"
        >
          <RotateCcw className="size-4" />
          重新找小节线
        </Button>
      </div>
    </div>
  );
}
