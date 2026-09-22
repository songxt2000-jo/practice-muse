import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { transcribePiece } from "@/lib/scores.functions";
import { openBookSource } from "@/lib/book-pages";
import { useAbcPlayer } from "@/lib/use-abc-player";
import { replaceRange, setDuration, shiftOctave, shiftSemitone } from "@/lib/abc-edit";
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
  Pencil,
  Repeat,
  Save,
  Square,
  Undo2,
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

  // 人工改谱
  const [editMode, setEditMode] = useState(false);
  const [draftAbc, setDraftAbc] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ startChar: number; endChar: number } | null>(null);
  const [tokenText, setTokenText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftAbc(piece?.abc_notation ?? null);
    setSelection(null);
  }, [piece?.abc_notation]);

  const dirty = !!draftAbc && draftAbc !== (piece?.abc_notation ?? null);

  const handleNoteClick = useCallback(
    (info: { startChar: number; endChar: number; text: string }) => {
      if (!editMode) return false;
      setSelection({ startChar: info.startChar, endChar: info.endChar });
      setTokenText(info.text);
      return true;
    },
    [editMode],
  );

  const player = useAbcPlayer({
    abc: draftAbc,
    tempo,
    loop: loopOn ? { from: loopFrom - 1, to: loopTo - 1 } : null,
    onNoteClick: handleNoteClick,
  });

  const applyToken = useCallback(
    (next: string | null) => {
      if (!next || !selection || !draftAbc) {
        if (!next) toast.error("这个记号暂时不支持快捷修改，可直接编辑下方文本。");
        return;
      }
      setDraftAbc(replaceRange(draftAbc, selection.startChar, selection.endChar, next));
      setSelection({ startChar: selection.startChar, endChar: selection.startChar + next.length });
      setTokenText(next);
    },
    [draftAbc, selection],
  );

  const currentToken = selection && draftAbc
    ? draftAbc.slice(selection.startChar, selection.endChar)
    : "";

  async function saveAbc() {
    if (!draftAbc) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("pieces")
        .update({ abc_notation: draftAbc })
        .eq("id", pieceId);
      if (error) throw error;
      toast.success("修改已保存。");
      void queryClient.invalidateQueries({ queryKey: ["piece", pieceId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const transcribe = useCallback(async () => {
    if (!piece) return;
    setTranscribing(true);
    try {
      const { data: book, error } = await supabase
        .from("books")
        .select("storage_path, source_type")
        .eq("id", piece.book_id!)
        .single();
      if (error || !book?.storage_path) throw new Error("找不到曲集文件");

      const pdf = await openBookSource(book.storage_path, book.source_type);
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

            <div className="surface-salon mt-4 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Pencil className="size-4 text-primary" />
                  <Label htmlFor="edit-mode" className="text-sm">
                    修改音符
                  </Label>
                  <Switch
                    id="edit-mode"
                    checked={editMode}
                    onCheckedChange={(on) => {
                      setEditMode(on);
                      setSelection(null);
                      if (on) player.pause();
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {editMode
                    ? selection
                      ? `已选中：${currentToken}`
                      : "点击谱面上任意一个音符来修改它"
                    : "打开后，点击谱面音符即可手工纠正 AI 识别错误"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!dirty}
                    onClick={() => {
                      setDraftAbc(piece?.abc_notation ?? null);
                      setSelection(null);
                    }}
                  >
                    <Undo2 className="size-4" />
                    还原
                  </Button>
                  <Button size="sm" disabled={!dirty || saving} onClick={saveAbc}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    保存修改
                  </Button>
                </div>
              </div>

              {editMode && selection && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftStep(currentToken, 1))}>
                      升一个音
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftStep(currentToken, -1))}>
                      降一个音
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftSemitone(currentToken, 1))}>
                      升半音 ♯
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftSemitone(currentToken, -1))}>
                      降半音 ♭
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftOctave(currentToken, 1))}>
                      升八度
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftOctave(currentToken, -1))}>
                      降八度
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">时值：</span>
                    {[
                      { label: "二倍", value: "2" },
                      { label: "原长", value: "" },
                      { label: "一半", value: "/2" },
                      { label: "四分之一", value: "/4" },
                      { label: "附点", value: "3/2" },
                    ].map((option) => (
                      <Button
                        key={option.label}
                        size="sm"
                        variant="secondary"
                        onClick={() => applyToken(setDuration(currentToken, option.value))}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">直接改写：</span>
                      <Input
                        value={tokenText}
                        onChange={(e) => setTokenText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") applyToken(parseHumanNote(tokenText));
                        }}
                        placeholder="中央do / 升fa / 低音la 两拍"
                        className="w-56"
                      />
                      <Button size="sm" onClick={() => applyToken(parseHumanNote(tokenText))}>
                        应用
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => applyToken("z")}>
                        变成休止符
                      </Button>
                      {tokenText.trim() && (
                        <span className="text-xs text-muted-foreground">
                          {parseHumanNote(tokenText)
                            ? `将写成：${parseHumanNote(tokenText)}`
                            : "没听懂这个写法，换个说法试试"}
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                      <p className="text-foreground">可以直接用中文说，也可以写音名：</p>
                      <p>音高：中央do / 中央C、低音sol、高音la、高音5（1~7 对应 do~si）</p>
                      <p>升降：升fa、降si、还原mi（也可写 ^F、_B、=E）</p>
                      <p>时长：两拍、半拍、附点，例如「低音la 两拍」「高音do 半拍」</p>
                      <p>休止：直接输入「休止」或 z</p>
                    </div>
                  </div>
                </div>
              )}
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
