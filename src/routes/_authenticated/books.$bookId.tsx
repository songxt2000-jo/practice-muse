import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scanBookPages } from "@/lib/scores.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, ScanLine, Music2 } from "lucide-react";
import { openBookPdf } from "@/lib/book-pdf";

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
  const { bookId } = Route.useParams();
  const queryClient = useQueryClient();
  const scanPages = useServerFn(scanBookPages);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);

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

  // Render a handful of preview thumbnails once the book is known.
  useEffect(() => {
    if (!storagePath) return;
    let cancelled = false;
    (async () => {
      try {
        const pdf = await openBookPdf(storagePath);
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
  }, [storagePath]);

  async function runScan() {
    const book = bookQuery.data;
    if (!book?.storage_path) return;
    setScanning(true);
    setProgress(0);
    try {
      const pdf = await openBookPdf(book.storage_path);
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

      for (let start = 1; start <= total; start += batchSize) {
        const pages: Array<{ page: number; dataUrl: string }> = [];
        for (let p = start; p < start + batchSize && p <= total; p += 1) {
          pages.push({ page: p, dataUrl: await pdf.renderPage(p, 1000) });
        }
        const result = await scanPages({ data: { pages, totalPages: total } });
        entries.push(...(result?.entries ?? []));
        setProgress(Math.round(((start + batchSize - 1) / total) * 100));
      }

      const sorted = entries
        .filter((e) => e.startPage >= 1 && e.startPage <= total)
        .sort((a, b) => a.startPage - b.startPage)
        .filter((e, i, arr) => i === 0 || arr[i - 1]!.startPage !== e.startPage);

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user!.id;

      const rows = sorted.map((entry, index) => ({
        user_id: uid,
        book_id: bookId,
        title: entry.title,
        composer: entry.composer ?? book.composer,
        era: entry.era,
        mood: entry.mood,
        key_signature: entry.keySignature,
        start_page: entry.startPage,
        end_page: entry.endPage ?? (sorted[index + 1]?.startPage ?? total + 1) - 1,
        sort_order: index,
      }));

      await supabase.from("pieces").delete().eq("book_id", bookId);
      if (rows.length) {
        const { error } = await supabase.from("pieces").insert(rows);
        if (error) throw error;
      }
      await supabase.from("books").update({ scan_status: "ready" }).eq("id", bookId);

      toast.success(`拆书完成，共识别 ${rows.length} 首曲目。`);
      void queryClient.invalidateQueries({ queryKey: ["pieces", bookId] });
      void queryClient.invalidateQueries({ queryKey: ["book", bookId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "拆书失败，请稍后重试");
    } finally {
      setScanning(false);
      setProgress(0);
    }
  }

  const book = bookQuery.data;

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/archive" className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            ← 返回曲库
          </Link>
          <h1 className="mt-2 text-3xl">{book?.title ?? "载入中…"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {book?.composer ?? "未知作曲家"} · 共 {book?.page_count ?? 0} 页
          </p>
        </div>
        <Button onClick={runScan} disabled={scanning || !book?.storage_path}>
          {scanning ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
          {scanning ? "正在拆书…" : "AI 拆书（扫描曲目）"}
        </Button>
      </div>

      {scanning && <Progress value={progress} className="mt-4" />}

      <section className="mt-8">
        <h2 className="text-xl">曲目</h2>
        {piecesQuery.data?.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">还没有曲目，先执行一次 AI 拆书。</p>
        )}
        <div className="mt-4 grid gap-3">
          {piecesQuery.data?.map((piece) => (
            <Link
              key={piece.id}
              to="/practice/$pieceId"
              params={{ pieceId: piece.id }}
              className="surface-salon flex items-center justify-between rounded-xl px-5 py-4 transition hover:border-primary"
            >
              <div>
                <p className="text-lg">{piece.title}</p>
                <p className="text-sm text-muted-foreground">
                  第 {piece.start_page}–{piece.end_page} 页
                  {piece.mood ? ` · ${piece.mood}` : ""}
                </p>
              </div>
              <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <Music2 className="size-4" />
                {piece.transcribe_status === "ready" ? "可练习" : "待识谱"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl">页面预览</h2>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {thumbs.map((src, index) => (
            <figure key={index} className="score-sheet overflow-hidden">
              <img src={src} alt={`第 ${index + 1} 页`} className="w-full" />
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
