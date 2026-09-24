import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scanBookPages } from "@/lib/scores.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ScanLine, Music2, BookOpen, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { openBookSource } from "@/lib/book-pages";
import { useLanguage, useLocalizedDocumentTitle } from "@/lib/i18n";
import { AddToCollection } from "@/components/add-to-collection";

export const Route = createFileRoute("/_authenticated/books/$bookId")({
  head: () => ({
    meta: [
      { title: "曲集详情 · 琴谱工作台" },
      { name: "description", content: "查看曲集页面缩略图，自动拆分出曲目目录。" },
      { property: "og:title", content: "曲集详情 · 琴谱工作台" },
      { property: "og:description", content: "查看曲集页面缩略图，自动拆分出曲目目录。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  const { text } = useLanguage();
  useLocalizedDocumentTitle("曲集详情 · 琴谱工作台", "Collection · Piano Workbench");
  const { bookId } = Route.useParams();
  const queryClient = useQueryClient();
  const scanPages = useServerFn(scanBookPages);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [skipPages, setSkipPages] = useState(0);
  const [manualTitle, setManualTitle] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const bookQuery = useQuery({
    queryKey: ["book", bookId],
    queryFn: async () => {
      const { data, error } = await supabase.from("books").select("*").eq("id", bookId).single();
      if (error) throw error;
      return data;
    },
  });

  const piecesQuery = useQuery({
    queryKey: ["pieces", bookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pieces")
        .select("*")
        .eq("book_id", bookId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const storagePath = bookQuery.data?.storage_path ?? null;
  const sourceType = bookQuery.data?.source_type ?? "pdf";

  // Render a handful of preview thumbnails once the book is known.
  useEffect(() => {
    if (!storagePath) return;
    let cancelled = false;
    (async () => {
      try {
        const pdf = await openBookSource(storagePath, sourceType);
        const out: string[] = [];
        const max = Math.min(pdf.numPages, 24);
        for (let i = 1; i <= max; i += 1) {
          const url = await pdf.renderPage(i, 220);
          if (cancelled) return;
          out.push(url);
          setThumbs([...out]);
        }
      } catch {
        /* preview is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath, sourceType]);

  async function runScan() {
    const book = bookQuery.data;
    if (!book?.storage_path) return;
    setScanning(true);
    setProgress(0);
    try {
      const pdf = await openBookSource(book.storage_path, book.source_type);
      const total = pdf.numPages;
      const batchSize = 8;
      type Entry = {
        title: string;
        composer: string | null;
        startPage: number;
        endPage: number | null;
        era: string | null;
        mood: string | null;
        keySignature: string | null;
      };
      const entries: Entry[] = [];

      const firstPage = Math.min(Math.max(skipPages, 0) + 1, total);

      for (let start = firstPage; start <= total; start += batchSize) {
        const pages: Array<{ page: number; dataUrl: string }> = [];
        for (let p = start; p < start + batchSize && p <= total; p += 1) {
          pages.push({ page: p, dataUrl: await pdf.renderPage(p, 1000) });
        }
        const result = await scanPages({ data: { pages, totalPages: total } });
        entries.push(...(result?.entries ?? []));
        setProgress(Math.round(((start + batchSize - 1) / total) * 100));
      }

      const sorted = entries
        .filter((e) => e.startPage >= firstPage && e.startPage <= total)
        .sort((a, b) => a.startPage - b.startPage)
        .filter((e, i, arr) => i === 0 || arr[i - 1]!.startPage !== e.startPage);

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user!.id;

      // 合并模式：已经识过谱（abc_notation 非空）的曲目按页码范围对上就保留，
      // 不删除、不重置，避免重复消耗 AI 识谱额度。
      const { data: existingPieces } = await supabase
        .from("pieces")
        .select("id, start_page, end_page, abc_notation")
        .eq("book_id", bookId);
      const transcribed = (existingPieces ?? []).filter((p) => !!p.abc_notation);
      const matchedIds = new Set<string>();
      const overlaps = (
        aStart: number,
        aEnd: number,
        bStart: number | null,
        bEnd: number | null,
      ) => {
        const bs = bStart ?? aStart;
        const be = bEnd ?? bs;
        return aStart <= be && bs <= aEnd;
      };

      const insertRows: Array<{
        user_id: string;
        book_id: string;
        title: string;
        composer: string | null;
        era: string | null;
        mood: string | null;
        key_signature: string | null;
        start_page: number;
        end_page: number;
        sort_order: number;
      }> = [];
      const sortUpdates: Array<PromiseLike<unknown>> = [];
      let preserved = 0;

      sorted.forEach((entry, index) => {
        const endPage = entry.endPage ?? (sorted[index + 1]?.startPage ?? total + 1) - 1;
        const hit = transcribed.find(
          (p) => !matchedIds.has(p.id) && overlaps(entry.startPage, endPage, p.start_page, p.end_page),
        );
        if (hit) {
          matchedIds.add(hit.id);
          preserved += 1;
          sortUpdates.push(
            supabase.from("pieces").update({ sort_order: index }).eq("id", hit.id),
          );
        } else {
          insertRows.push({
            user_id: uid,
            book_id: bookId,
            title: entry.title,
            composer: entry.composer ?? book.composer,
            era: entry.era,
            mood: entry.mood,
            key_signature: entry.keySignature,
            start_page: entry.startPage,
            end_page: endPage,
            sort_order: index,
          });
        }
      });

      // 没识过谱、又没被任何 AI 条目对上的旧条目（含手动未识谱的）按原逻辑替换掉。
      const stale = (existingPieces ?? []).filter(
        (p) => !matchedIds.has(p.id) && !p.abc_notation,
      );
      if (stale.length) {
        await supabase.from("pieces").delete().in("id", stale.map((p) => p.id));
      }
      await Promise.all(sortUpdates);
      if (insertRows.length) {
        const { error } = await supabase.from("pieces").insert(insertRows);
        if (error) throw error;
      }
      await supabase.from("books").update({ scan_status: "ready" }).eq("id", bookId);

      toast.success(
        preserved > 0
          ? text(`拆书完成，共识别 ${sorted.length} 首曲目，其中 ${preserved} 首已识谱的结果原样保留。`, `Organization complete: ${sorted.length} pieces found, with ${preserved} existing transcriptions preserved.`)
          : text(`拆书完成，共识别 ${sorted.length} 首曲目。`, `Organization complete: ${sorted.length} pieces found.`),
      );
      void queryClient.invalidateQueries({ queryKey: ["pieces", bookId] });
      void queryClient.invalidateQueries({ queryKey: ["book", bookId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text("拆书失败，请稍后重试", "Could not organize this collection. Please try again."));
    } finally {
      setScanning(false);
      setProgress(0);
    }
  }

  async function addManualPiece() {
    const total = bookQuery.data?.page_count ?? 0;
    const start = Number(manualStart);
    const end = Number(manualEnd || manualStart);
    const title = manualTitle.trim();
    if (!title) { toast.error(text("请先填写曲名", "Enter a piece title")); return; }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || (total && end > total)) {
      toast.error(text(`页码不对：起始页需 ≥1，结束页不能小于起始页${total ? `，且不超过 ${total}` : ""}`, `Invalid pages: the first page must be at least 1, the last cannot be earlier${total ? `, and cannot exceed ${total}` : ""}`));
      return;
    }
    setAdding(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const existing = piecesQuery.data ?? [];
      const { error } = await supabase.from("pieces").insert({
        user_id: userData.user!.id,
        book_id: bookId,
        title,
        composer: bookQuery.data?.composer ?? null,
        start_page: start,
        end_page: end,
        sort_order: existing.length,
      });
      if (error) throw error;
      // keep list in page order
      const all = [...existing.map((p) => ({ id: p.id, start: p.start_page ?? 0 }))];
      const { data: fresh } = await supabase.from("pieces").select("id, start_page").eq("book_id", bookId);
      const ordered = (fresh ?? all.map((a) => ({ id: a.id, start_page: a.start })))
        .slice()
        .sort((a, b) => (a.start_page ?? 0) - (b.start_page ?? 0));
      await Promise.all(
        ordered.map((p, i) => supabase.from("pieces").update({ sort_order: i }).eq("id", p.id)),
      );
      toast.success(text(`已添加《${title}》（第 ${start}–${end} 页）`, `Added “${title}” (pages ${start}–${end})`));
      setManualTitle("");
      setManualStart("");
      setManualEnd("");
      void queryClient.invalidateQueries({ queryKey: ["pieces", bookId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text("添加失败", "Could not add piece"));
    } finally {
      setAdding(false);
    }
  }

  type PieceRow = NonNullable<typeof piecesQuery.data>[number];

  function startEdit(p: PieceRow) {
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditStart(String(p.start_page ?? ""));
    setEditEnd(String(p.end_page ?? ""));
  }

  async function resort() {
    const { data: fresh } = await supabase.from("pieces").select("id, start_page").eq("book_id", bookId);
    const ordered = (fresh ?? []).slice().sort((a, b) => (a.start_page ?? 0) - (b.start_page ?? 0));
    await Promise.all(ordered.map((p, i) => supabase.from("pieces").update({ sort_order: i }).eq("id", p.id)));
  }

  async function saveEdit(p: PieceRow) {
    const total = bookQuery.data?.page_count ?? 0;
    const title = editTitle.trim();
    const start = Number(editStart);
    const end = Number(editEnd || editStart);
    if (!title) { toast.error(text("曲名不能为空", "Piece title cannot be empty")); return; }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || (total && end > total)) {
      toast.error(text(`页码不对：起始页需 ≥1，结束页不能小于起始页${total ? `，且不超过 ${total}` : ""}`, `Invalid pages: the first page must be at least 1, the last cannot be earlier${total ? `, and cannot exceed ${total}` : ""}`));
      return;
    }
    const pagesChanged = start !== p.start_page || end !== p.end_page;
    if (pagesChanged && p.abc_notation && !window.confirm(text("这首已经识过谱，页码改了之后旧的识谱结果可能对不上。仍然保留旧结果吗？（可之后在识谱页重新识别）", "This piece has already been transcribed. Changing its pages may make the existing notation inaccurate. Keep it anyway?"))) {
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase.from("pieces").update({ title, start_page: start, end_page: end }).eq("id", p.id);
      if (error) throw error;
      if (pagesChanged) await resort();
      toast.success(text("已更新", "Updated"));
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ["pieces", bookId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text("保存失败", "Could not save changes"));
    } finally {
      setSavingEdit(false);
    }
  }

  async function deletePiece(p: PieceRow) {
    if (!window.confirm(text(`确定删除《${p.title}》吗？${p.abc_notation ? "它的识谱结果也会一起删除。" : ""}`, `Delete “${p.title}”?${p.abc_notation ? " Its transcription will also be deleted." : ""}`))) return;
    const { error } = await supabase.from("pieces").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    await resort();
    toast.success(text("已删除", "Deleted"));
    void queryClient.invalidateQueries({ queryKey: ["pieces", bookId] });
  }

  const book = bookQuery.data;

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/archive" className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            ← {text("返回曲库", "Back to library")}
          </Link>
          <h1 className="mt-2 text-3xl">{book?.title ?? text("载入中…", "Loading…")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {book?.composer ?? text("未知作曲家", "Unknown composer")} · {book?.page_count ?? 0} {text("页", "pages")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="skip" className="text-xs text-muted-foreground">
              {text("跳过开头页数（前言 / 编者按）", "Skip opening pages (preface / notes)")}
            </Label>
            <Input
              id="skip"
              type="number"
              min={0}
              max={book?.page_count ?? 0}
              value={skipPages}
              onChange={(e) => setSkipPages(Math.max(0, Number(e.target.value) || 0))}
              className="w-28"
            />
          </div>
          <Button onClick={runScan} disabled={scanning || !book?.storage_path}>
            {scanning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ScanLine className="size-4" />
            )}
            {scanning ? text("正在拆书…", "Scanning…") : text("AI 拆书（扫描曲目）", "AI organize (scan pieces)")}
          </Button>
        </div>
      </div>

      {scanning && <Progress value={progress} className="mt-4" />}

      <section className="surface-salon mt-6 rounded-xl p-5">
        <h2 className="text-xl">{text("手动拆书（不用 AI）", "Organize manually (no AI)")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {text("输入曲名和页码范围，直接把这几页拆成一首曲目。", "Enter a title and page range to create a piece from those pages.")}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor="m-title" className="text-xs text-muted-foreground">{text("曲名", "Title")}</Label>
            <Input id="m-title" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder={text("例如：小步舞曲", "e.g. Minuet")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-start" className="text-xs text-muted-foreground">{text("起始页", "First page")}</Label>
            <Input id="m-start" type="number" min={1} value={manualStart} onChange={(e) => setManualStart(e.target.value)} className="w-24" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-end" className="text-xs text-muted-foreground">{text("结束页", "Last page")}</Label>
            <Input id="m-end" type="number" min={1} value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} className="w-24" />
          </div>
          <Button variant="secondary" onClick={addManualPiece} disabled={adding}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {text("添加曲目", "Add piece")}
          </Button>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl">{text("曲目", "Pieces")}</h2>
        {piecesQuery.data?.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">{text("还没有曲目，可手动添加或使用 AI 拆书。", "No pieces yet. Add one manually or use AI organization.")}</p>
        )}
        <div className="mt-4 grid gap-3">
          {piecesQuery.data?.map((piece) => (
            <div
              key={piece.id}
              className="surface-salon flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4"
            >
              {editingId === piece.id ? (
                <div className="flex flex-1 flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">{text("曲名", "Title")}</Label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{text("起始页", "First page")}</Label>
                    <Input type="number" min={1} value={editStart} onChange={(e) => setEditStart(e.target.value)} className="w-20" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{text("结束页", "Last page")}</Label>
                    <Input type="number" min={1} value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="w-20" />
                  </div>
                  <Button size="sm" onClick={() => saveEdit(piece)} disabled={savingEdit}>
                    {savingEdit ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    {text("保存", "Save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="size-4" />
                    {text("取消", "Cancel")}
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center gap-1">
                      <p className="text-lg">{piece.title}</p>
                      <button
                        type="button"
                        onClick={() => startEdit(piece)}
                        aria-label={text("修改曲名和页码", "Edit title and pages")}
                        title={text("修改曲名和页码", "Edit title and pages")}
                        className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {text(`第 ${piece.start_page}–${piece.end_page} 页`, `Pages ${piece.start_page}–${piece.end_page}`)}
                      {piece.mood ? ` · ${piece.mood}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AddToCollection pieceId={piece.id} />
                    <Button size="sm" variant="ghost" onClick={() => deletePiece(piece)} aria-label={text("删除曲目", "Delete piece")}>
                      <Trash2 className="size-4" />
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link
                        to="/practice/$pieceId"
                        params={{ pieceId: piece.id }}
                        search={{ mode: "follow" }}
                      >
                        <BookOpen className="size-4" />
                        {text("原谱跟随", "Follow original")}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/practice/$pieceId" params={{ pieceId: piece.id }} search={{ mode: "ai" }}>
                        <Music2 className="size-4" />
                        {piece.transcribe_status === "ready" ? text("AI 识谱 · 可练习", "AI notation · Ready") : text("AI 识谱", "AI notation")}
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl">{text("页面预览", "Page preview")}</h2>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {thumbs.map((src, index) => (
            <figure key={index} className="score-sheet overflow-hidden">
              <img src={src} alt={text(`第 ${index + 1} 页`, `Page ${index + 1}`)} className="w-full" />
              <figcaption className="px-2 py-1 text-center text-[10px] text-score-foreground/70">
                {index + 1}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
