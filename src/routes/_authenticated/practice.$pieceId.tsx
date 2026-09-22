import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { transcribePiece } from "@/lib/scores.functions";
import { openBookSource } from "@/lib/book-pages";
import { useAbcPlayer } from "@/lib/use-abc-player";
import { PianoKeyboard } from "@/components/piano-keyboard";
import { Metronome } from "@/components/metronome";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Square,
  Wand2,
} from "lucide-react";
import { recordPiecePractice, finishSession } from "@/lib/practice-session";

export const Route = createFileRoute("/_authenticated/practice/$pieceId")({
  head: () => ({
    meta: [
      { title: "练习室 · 琴谱工作台" },
      { name: "description", content: "五线谱播放、虚拟键盘联动、节拍器与选段循环练习。" },
      { property: "og:title", content: "练习室 · 琴谱工作台" },
      { property: "og:description", content: "五线谱播放、虚拟键盘联动、节拍器与选段循环练习。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PracticeStudio,
});

function PracticeStudio() {
  const { pieceId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runTranscribe = useServerFn(transcribePiece);

  const [tempo, setTempo] = useState(90);
  const [loopOn, setLoopOn] = useState(false);
  const [loopFrom, setLoopFrom] = useState(1);
  const [loopTo, setLoopTo] = useState(4);
  const [focus, setFocus] = useState(false);
  const [hideTimer, setHideTimer] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const startedAt = useRef(Date.now());
  const shellRef = useRef<HTMLDivElement | null>(null);

  const pieceQuery = useQuery({
    queryKey: ["piece", pieceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pieces").select("*").eq("id", pieceId).single();
      if (error) throw error;
      return data;
    },
  });

  const piece = pieceQuery.data;

  useEffect(() => {
    if (piece?.default_tempo) setTempo(piece.default_tempo);
  }, [piece?.default_tempo]);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const player = useAbcPlayer({
    abc: piece?.abc_notation ?? null,
    tempo,
    loop: loopOn ? { from: loopFrom - 1, to: loopTo - 1 } : null,
  });

  const transcribe = useCallback(async () => {
    if (!piece) return;
    setTranscribing(true);
    try {
      const { data: book, error } = await supabase
        .from("books")
        .select("storage_path")
        .eq("id", piece.book_id!)
        .single();
      if (error || !book?.storage_path) throw new Error("找不到曲集文件");

      const pdf = await openBookPdf(book.storage_path);
      const start = piece.start_page ?? 1;
      const end = Math.min(piece.end_page ?? start, start + 7, pdf.numPages);
      const pages: Array<{ page: number; dataUrl: string }> = [];
      for (let p = start; p <= end; p += 1) {
        pages.push({ page: p, dataUrl: await pdf.renderPage(p, 1400) });
      }
      await runTranscribe({ data: { pieceId, title: piece.title, pages } });
      toast.success("识谱完成，可以开始练习了。");
      void queryClient.invalidateQueries({ queryKey: ["piece", pieceId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "识谱失败，请重试");
    } finally {
      setTranscribing(false);
    }
  }, [piece, pieceId, queryClient, runTranscribe]);

  async function endPractice() {
    player.stop();
    // 结束报告弹窗暂时关闭（将来做师生练习报告时恢复 UI），计时数据仍照常入库。
    await recordPiecePractice({
      pieceId,
      pieceTitle: piece?.title ?? "未命名",
      seconds: elapsed,
      tempo,
      loopFrom: loopOn ? loopFrom : null,
      loopTo: loopOn ? loopTo : null,
    });
    await finishSession();
    navigate({ to: "/archive" });
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await shellRef.current?.requestFullscreen?.();
      setFocus(true);
    } else {
      await document.exitFullscreen();
      setFocus(false);
    }
  }

  if (pieceQuery.isLoading) {
    return <div className="p-10 text-center text-muted-foreground">载入中…</div>;
  }

  return (
    <div
      ref={shellRef}
      className={`min-h-screen bg-background px-5 py-6 ${
        focus ? "h-screen overflow-y-auto" : ""
      }`}
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl">{piece?.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {piece?.composer ?? "未知作曲家"}
              {piece?.key_signature ? ` · ${piece.key_signature}` : ""} · 第 {piece?.start_page}–
              {piece?.end_page} 页
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!hideTimer && (
              <span className="rounded-full border border-border px-3 py-1 text-sm tabular-nums">
                {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                {String(elapsed % 60).padStart(2, "0")}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
              {focus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              专注
            </Button>
            <Button variant="secondary" size="sm" onClick={endPractice}>
              结束练习
            </Button>
          </div>
        </div>

        {!piece?.abc_notation ? (
          <div className="surface-salon mt-8 rounded-xl p-10 text-center">
            <p className="text-muted-foreground">这首曲子还没有识谱。</p>
            <Button className="mt-4" onClick={transcribe} disabled={transcribing}>
              {transcribing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              {transcribing ? "AI 正在识谱…" : "开始识谱"}
            </Button>
          </div>
        ) : (
          <>
            <div className="score-sheet mt-6 p-4">
              <div className="overflow-hidden">
                <div ref={player.containerRef} className="transition-transform duration-500" />
              </div>
              {player.error && (
                <p className="p-4 text-sm text-destructive">{player.error}</p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-center gap-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => player.goToPage(player.page - 1)}
                disabled={player.page === 0}
              >
                <ChevronLeft className="size-4" />
                上一页
              </Button>
              <span className="text-xs text-muted-foreground">
                第 {player.page + 1} / {player.pageCount} 页（每页 4 行，播放时自动翻页）
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => player.goToPage(player.page + 1)}
                disabled={player.page >= player.pageCount - 1}
              >
                下一页
                <ChevronRight className="size-4" />
              </Button>
            </div>

            {focus && (
              <div className="mt-6 flex justify-center">
                <div
                  className="text-6xl"
                  style={{
                    animation: "angel-spin 6s linear infinite",
                    animationPlayState: player.playing ? "running" : "paused",
                    transition: "transform 1.2s ease-out",
                  }}
                >
                  🩰
                </div>
              </div>
            )}

            <div className="surface-salon mt-6 rounded-xl p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => (player.playing ? player.pause() : void player.play())}
                  disabled={!player.ready}
                >
                  {player.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                  {player.playing ? "暂停" : "播放"}
                </Button>
                <Button variant="secondary" onClick={player.stop}>
                  <Square className="size-4" />
                  停止
                </Button>
                <Metronome bpm={tempo} syncBeat={player.beat} syncing={player.playing} />
                <div className="flex items-center gap-2">
                  <Switch id="hide-timer" checked={hideTimer} onCheckedChange={setHideTimer} />
                  <Label htmlFor="hide-timer" className="text-sm">
                    隐藏计时器
                  </Label>
                </div>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
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
                    onValueChange={([value]) => setTempo(value ?? 90)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Repeat className="size-4" /> 选段循环 (AB)
                    </span>
                    <Switch checked={loopOn} onCheckedChange={setLoopOn} />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={loopFrom}
                      onChange={(e) => setLoopFrom(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">至</span>
                    <Input
                      type="number"
                      min={1}
                      value={loopTo}
                      onChange={(e) => setLoopTo(Number(e.target.value))}
                      className="w-20"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => player.seekToMeasure(loopFrom - 1)}
                    >
                      跳到起点
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      共 {player.measureCount} 小节
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <PianoKeyboard active={player.activeMidi} />
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  当前第 {player.measure + 1} 小节 · 点击谱面任意音符可从该处起播
                </p>
              </div>
            </div>

            <Collapsible className="surface-salon mt-6 rounded-xl p-5">
              <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                <span className="text-xl" style={{ fontFamily: "var(--font-display)" }}>
                  乐曲创作背景
                </span>
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  <span className="text-foreground">作曲家：</span>
                  {piece?.composer ?? "—"}
                </p>
                <p>
                  <span className="text-foreground">年代：</span>
                  {piece?.era ?? "—"}
                </p>
                <p>
                  <span className="text-foreground">情绪：</span>
                  {piece?.mood ?? "—"}
                </p>
                <p>
                  <span className="text-foreground">背景：</span>
                  {piece?.background ?? "—"}
                </p>
                <p>
                  <span className="text-foreground">故事剧情：</span>
                  {piece?.story ?? "—"}
                </p>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </div>

    </div>
  );
}
