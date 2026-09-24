import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { transcribePiece } from "@/lib/scores.functions";
import { openBookSource } from "@/lib/book-pages";
import { useAbcPlayer } from "@/lib/use-abc-player";
import { parseHumanNote, replaceRange, setDuration, shiftOctave, shiftSemitone, shiftStep } from "@/lib/abc-edit";
import { PianoKeyboard } from "@/components/piano-keyboard";
import { Metronome } from "@/components/metronome";
import { MusicBoxBallerina } from "@/components/music-box-ballerina";
import { ScoreFollower } from "@/components/score-follower";
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
import { useLanguage, useLocalizedDocumentTitle } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";

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
  validateSearch: (search: Record<string, unknown>): { mode?: "follow" | "ai" } =>
    search["mode"] === "ai" || search["mode"] === "follow" ? { mode: search["mode"] } : {},
  component: PracticeStudio,
});

function PracticeStudio() {
  const { text } = useLanguage();
  useLocalizedDocumentTitle("练习室 · 琴谱工作台", "Practice Studio · Piano Workbench");
  const { pieceId } = Route.useParams();
  const mode = Route.useSearch().mode ?? "follow";
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
  const [following, setFollowing] = useState(false);
  const [followerStop, setFollowerStop] = useState(0);
  const [followPos, setFollowPos] = useState<{ measure: number | null; total: number }>({ measure: null, total: 0 });
  const onFollowPosition = useCallback((measure: number | null, total: number) => setFollowPos({ measure, total }), []);
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
        if (!next) toast.error(text("这个记号暂时不支持快捷修改，可直接编辑下方文本。", "This symbol cannot be changed with a shortcut. Use the field below."));
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
      toast.success(text("修改已保存。", "Changes saved."));
      void queryClient.invalidateQueries({ queryKey: ["piece", pieceId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : text("保存失败", "Could not save"));
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
      if (error || !book?.storage_path) throw new Error(text("找不到曲集文件", "Collection file not found"));

      const pdf = await openBookSource(book.storage_path, book.source_type);
      const start = piece.start_page ?? 1;
      const end = Math.min(piece.end_page ?? start, start + 7, pdf.numPages);
      const pages: Array<{ page: number; dataUrl: string }> = [];
      for (let p = start; p <= end; p += 1) {
        pages.push({ page: p, dataUrl: await pdf.renderPage(p, 1400) });
      }
      await runTranscribe({ data: { pieceId, title: piece.title, pages } });
      toast.success(text("识谱完成，可以开始练习了。", "Transcription complete. You can start practicing."));
      void queryClient.invalidateQueries({ queryKey: ["piece", pieceId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : text("识谱失败，请重试", "Transcription failed. Please try again."));
    } finally {
      setTranscribing(false);
    }
  }, [piece, pieceId, queryClient, runTranscribe]);

  async function endPractice() {
    player.stop();
    // 结束报告弹窗暂时关闭（将来做师生练习报告时恢复 UI），计时数据仍照常入库。
    await recordPiecePractice({
      pieceId,
      pieceTitle: piece?.title ?? text("未命名", "Untitled"),
      seconds: elapsed,
      tempo,
      loopFrom: loopOn ? loopFrom : null,
      loopTo: loopOn ? loopTo : null,
    });
    await finishSession();
    navigate({ to: "/archive" });
  }

  async function toggleFullscreen() {
    if (!focus) {
      // iPad 等不支持元素全屏的浏览器，照样进入专注布局。
      try {
        await shellRef.current?.requestFullscreen?.();
      } catch {
        /* ignore */
      }
      setFocus(true);
    } else {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setFocus(false);
    }
  }

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFocus(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const focusFollow = focus && mode === "follow";
  const shownMeasure = mode === "follow" ? followPos.measure : player.measure + 1;
  const totalMeasures = mode === "follow" ? followPos.total : player.measureCount;

  if (pieceQuery.isLoading) {
    return <div className="p-10 text-center text-muted-foreground">{text("载入中…", "Loading…")}</div>;
  }

  return (
    <>
      {!focus && <SiteHeader authenticated />}
      <div
        ref={shellRef}
        className={
          focusFollow
            ? "focus-room flex h-[100dvh] flex-col"
            : focus
              ? "focus-room h-[100dvh] overflow-y-auto"
              : "min-h-screen bg-background px-5 py-6"
        }
      >
        {focus && (
          <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-[var(--fr-line)] px-5 pt-[env(safe-area-inset-top,0px)]">
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={text("退出专注", "Leave focus")}
              className="flex size-11 items-center justify-center rounded-full text-[var(--fr-ink)]"
            >
              <ChevronLeft className="size-6" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-2xl italic leading-tight" style={{ fontFamily: "var(--font-display)" }}>
                {piece?.title}
              </div>
              <div className="truncate text-xs text-[var(--fr-muted)]">
                {piece?.composer ?? text("未知作曲家", "Unknown composer")}
                {piece?.start_page ? text(` · 第 ${piece.start_page} 页`, ` · Page ${piece.start_page}`) : ""}
              </div>
            </div>
            {totalMeasures > 0 && (
              <div className="flex items-baseline gap-1.5 tabular-nums">
                <span className="text-xs text-[var(--fr-muted)]">{text("小节", "Bar")}</span>
                <span className="text-[28px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  {shownMeasure ?? "–"}
                </span>
                <span className="text-sm text-[var(--fr-muted)]">/ {totalMeasures}</span>
              </div>
            )}
          </header>
        )}
        <div className={focusFollow ? "flex min-h-0 flex-1 flex-col" : focus ? "mx-auto max-w-5xl px-5 py-6" : "mx-auto max-w-5xl"}>
        <div className={focus ? "hidden" : "flex flex-wrap items-start justify-between gap-4"}>
          <div>
            <h1 className="text-3xl">{piece?.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {piece?.composer ?? text("未知作曲家", "Unknown composer")}
              {piece?.key_signature ? ` · ${piece.key_signature}` : ""} · {text(`第 ${piece?.start_page}–${piece?.end_page} 页`, `Pages ${piece?.start_page}–${piece?.end_page}`)}
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
              {text("专注", "Focus")}
            </Button>
            <Button variant="secondary" size="sm" onClick={endPractice}>
              {text("结束练习", "End practice")}
            </Button>
          </div>
        </div>

        <div className={focus ? "hidden" : "mt-4 inline-flex rounded-full border border-border p-1 text-sm"}>
          {([
            ["follow", text("原谱跟随", "Follow original")],
            ["ai", text("AI 识谱", "AI notation")],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (value === "ai") setFollowerStop((n) => n + 1);
                else player.pause();
                void navigate({ to: ".", search: { mode: value }, replace: true });
              }}
              className={`rounded-full px-4 py-1 transition ${
                mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "ai" && piece?.abc_notation && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={transcribing}
              onClick={() => {
                if (!window.confirm(text("重新识谱会覆盖当前的识谱结果（包括你手动修改过的音符），并消耗一次 AI 识谱。确定继续吗？", "Re-transcribing will overwrite the current notation (including your manual edits) and uses one AI transcription. Continue?"))) return;
                player.stop();
                void transcribe();
              }}
            >
              {transcribing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              {transcribing ? text("AI 正在重新识谱…", "AI is re-transcribing…") : text("重新识谱", "Re-transcribe")}
            </Button>
          </div>
        )}

        {piece && mode === "follow" && (
          <ScoreFollower
            piece={piece}
            tempo={tempo}
            onTempoChange={setTempo}
            onPlayingChange={(on) => {
              setFollowing(on);
              if (on) player.pause();
            }}
            stopSignal={followerStop}
            focus={focus}
            onPosition={onFollowPosition}
          />
        )}

        {focus && !focusFollow && (
          <MusicBoxBallerina playing={player.playing || following} className="mt-6" />
        )}

        {mode === "follow" ? null : !piece?.abc_notation ? (
          <div className="surface-salon mt-8 rounded-xl p-10 text-center">
            <p className="text-muted-foreground">{text("这首曲子还没有识谱。", "This piece has not been transcribed yet.")}</p>
            <Button className="mt-4" onClick={transcribe} disabled={transcribing}>
              {transcribing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              {transcribing ? text("AI 正在识谱…", "AI is transcribing…") : text("开始识谱", "Start transcription")}
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
                {text("上一页", "Previous")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {text(`第 ${player.page + 1} / ${player.pageCount} 页（每页 4 行，播放时自动翻页）`, `Page ${player.page + 1} / ${player.pageCount} (4 systems per page, auto-turn during playback)`)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => player.goToPage(player.page + 1)}
                disabled={player.page >= player.pageCount - 1}
              >
                {text("下一页", "Next")}
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="surface-salon mt-4 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Pencil className="size-4 text-primary" />
                  <Label htmlFor="edit-mode" className="text-sm">
                    {text("修改音符", "Edit notes")}
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
                      ? text(`已选中：${currentToken}`, `Selected: ${currentToken}`)
                      : text("点击谱面上任意一个音符来修改它", "Select any note in the score to edit it")
                    : text("打开后，点击谱面音符即可手工纠正 AI 识别错误", "Turn this on to correct AI transcription errors by selecting notes")}
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
                    {text("还原", "Reset")}
                  </Button>
                  <Button size="sm" disabled={!dirty || saving} onClick={saveAbc}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {text("保存修改", "Save changes")}
                  </Button>
                </div>
              </div>

              {editMode && selection && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftStep(currentToken, 1))}>
                      {text("升一个音", "Step up")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftStep(currentToken, -1))}>
                      {text("降一个音", "Step down")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftSemitone(currentToken, 1))}>
                      {text("升半音 ♯", "Semitone up ♯")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftSemitone(currentToken, -1))}>
                      {text("降半音 ♭", "Semitone down ♭")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftOctave(currentToken, 1))}>
                      {text("升八度", "Octave up")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToken(shiftOctave(currentToken, -1))}>
                      {text("降八度", "Octave down")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{text("时值：", "Duration:")}</span>
                    {[
                      { label: text("二倍", "Double"), value: "2" },
                      { label: text("原长", "Original"), value: "" },
                      { label: text("一半", "Half"), value: "/2" },
                      { label: text("四分之一", "Quarter"), value: "/4" },
                      { label: text("附点", "Dotted"), value: "3/2" },
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
                      <span className="text-xs text-muted-foreground">{text("直接改写：", "Direct entry:")}</span>
                      <Input
                        value={tokenText}
                        onChange={(e) => setTokenText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") applyToken(parseHumanNote(tokenText));
                        }}
                        placeholder={text("中央do / 升fa / 低音la 两拍", "middle C / F sharp / low A two beats")}
                        className="w-56"
                      />
                      <Button size="sm" onClick={() => applyToken(parseHumanNote(tokenText))}>
                        {text("应用", "Apply")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => applyToken("z")}>
                        {text("变成休止符", "Make rest")}
                      </Button>
                      {tokenText.trim() && (
                        <span className="text-xs text-muted-foreground">
                          {parseHumanNote(tokenText)
                            ? text(`将写成：${parseHumanNote(tokenText)}`, `Will write: ${parseHumanNote(tokenText)}`)
                            : text("没听懂这个写法，换个说法试试", "That format was not recognized. Try another wording.")}
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                      <p className="text-foreground">{text("可以直接用中文说，也可以写音名：", "Enter a note name or ABC notation:")}</p>
                      <p>{text("音高：中央do / 中央C、低音sol、高音la、高音5（1~7 对应 do~si）", "Pitch: middle C, low G, high A, or C/D/E/F/G/A/B")}</p>
                      <p>{text("升降：升fa、降si、还原mi（也可写 ^F、_B、=E）", "Accidentals: F sharp, B flat, E natural (or ^F, _B, =E)")}</p>
                      <p>{text("时长：两拍、半拍、附点，例如「低音la 两拍」「高音do 半拍」", "Duration: two beats, half beat, or dotted; e.g. low A two beats")}</p>
                      <p>{text("休止：直接输入「休止」或 z", "Rest: enter “rest” or z")}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>



            <div className="surface-salon mt-6 rounded-xl p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => {
                    if (player.playing) return player.pause();
                    setFollowerStop((n) => n + 1);
                    void player.play();
                  }}
                  disabled={!player.ready}
                >
                  {player.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                  {player.playing ? text("暂停", "Pause") : text("播放", "Play")}
                </Button>
                <Button variant="secondary" onClick={player.stop}>
                  <Square className="size-4" />
                  {text("停止", "Stop")}
                </Button>
                <Metronome bpm={tempo} syncBeat={player.beat} syncing={player.playing} />
                <div className="flex items-center gap-2">
                  <Switch id="hide-timer" checked={hideTimer} onCheckedChange={setHideTimer} />
                  <Label htmlFor="hide-timer" className="text-sm">
                    {text("隐藏计时器", "Hide timer")}
                  </Label>
                </div>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
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
                    onValueChange={([value]) => setTempo(value ?? 90)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Repeat className="size-4" /> {text("选段循环 (AB)", "Section loop (AB)")}
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
                    <span className="text-sm text-muted-foreground">{text("至", "to")}</span>
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
                      {text("跳到起点", "Go to start")}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {text(`共 ${player.measureCount} 小节`, `${player.measureCount} measures`)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <PianoKeyboard active={player.activeMidi} />
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {text(`当前第 ${player.measure + 1} 小节 · 点击谱面任意音符可从该处起播`, `Measure ${player.measure + 1} · Select any note to start playback there`)}
                </p>
              </div>
            </div>

            <Collapsible className="surface-salon mt-6 rounded-xl p-5">
              <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                <span className="text-xl" style={{ fontFamily: "var(--font-display)" }}>
                  {text("乐曲创作背景", "About the piece")}
                </span>
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  <span className="text-foreground">{text("作曲家：", "Composer: ")}</span>
                  {piece?.composer ?? "—"}
                </p>
                <p>
                  <span className="text-foreground">{text("年代：", "Era: ")}</span>
                  {piece?.era ?? "—"}
                </p>
                <p>
                  <span className="text-foreground">{text("情绪：", "Mood: ")}</span>
                  {piece?.mood ?? "—"}
                </p>
                <p>
                  <span className="text-foreground">{text("背景：", "Background: ")}</span>
                  {piece?.background ?? "—"}
                </p>
                <p>
                  <span className="text-foreground">{text("故事剧情：", "Story: ")}</span>
                  {piece?.story ?? "—"}
                </p>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
        </div>
      </div>
    </>
  );
}
