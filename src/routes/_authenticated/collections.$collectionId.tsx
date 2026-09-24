import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpen, Music2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useLanguage, useLocalizedDocumentTitle } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/collections/$collectionId")({
  head: () => ({
    meta: [
      { title: "自建曲集 · 琴谱工作台" },
      { name: "description", content: "把来自不同曲集的曲目整理在一起练习。" },
      { property: "og:title", content: "自建曲集 · 琴谱工作台" },
      { property: "og:description", content: "把来自不同曲集的曲目整理在一起练习。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CollectionPage,
});

function CollectionPage() {
  const { text } = useLanguage();
  useLocalizedDocumentTitle("自建曲集 · 琴谱工作台", "My Collection · Piano Workbench");
  const { collectionId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, name, collection_items(id, sort_order, piece_id, pieces(id, title, composer, start_page, end_page, transcribe_status, books(title)))")
        .eq("id", collectionId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const items = (q.data?.collection_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["collection", collectionId] });
    void qc.invalidateQueries({ queryKey: ["collections"] });
  }

  async function move(index: number, dir: -1 | 1) {
    const a = items[index];
    const b = items[index + dir];
    if (!a || !b) return;
    await Promise.all([
      supabase.from("collection_items").update({ sort_order: index + dir }).eq("id", a.id),
      supabase.from("collection_items").update({ sort_order: index }).eq("id", b.id),
    ]);
    refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("collection_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function deleteCollection() {
    if (!window.confirm(text("确定删除这个自建曲集吗？曲目本身不会被删除。", "Delete this collection? The pieces themselves will be kept."))) return;
    const { error } = await supabase.from("collections").delete().eq("id", collectionId);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["collections"] });
    navigate({ to: "/archive" });
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/archive" className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            ← {text("返回曲库", "Back to library")}
          </Link>
          <h1 className="mt-2 text-3xl">{q.data?.name ?? text("载入中…", "Loading…")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {text(`${items.length} 首曲目`, `${items.length} pieces`)}
          </p>
        </div>
        <Button variant="ghost" onClick={deleteCollection}>
          <Trash2 className="size-4" />
          {text("删除曲集", "Delete collection")}
        </Button>
      </div>

      {q.data && items.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">
          {text("还没有曲目。在任意曲集详情页点击曲目旁的「加入曲集」即可添加。", "No pieces yet. Use “Add to set” next to any piece in a collection page.")}
        </p>
      )}

      <div className="mt-6 grid gap-3">
        {items.map((item, index) => {
          const p = item.pieces;
          if (!p) return null;
          return (
            <div key={item.id} className="surface-salon flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <Button size="icon" variant="ghost" className="size-6" disabled={index === 0} onClick={() => move(index, -1)} aria-label={text("上移", "Move up")}>
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-6" disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label={text("下移", "Move down")}>
                    <ArrowDown className="size-3" />
                  </Button>
                </div>
                <div>
                  <p className="text-lg">{p.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.books?.title ?? ""}
                    {p.start_page ? text(` · 第 ${p.start_page}–${p.end_page} 页`, ` · Pages ${p.start_page}–${p.end_page}`) : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => remove(item.id)} aria-label={text("移出曲集", "Remove from collection")}>
                  <X className="size-4" />
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/practice/$pieceId" params={{ pieceId: p.id }} search={{ mode: "follow" }}>
                    <BookOpen className="size-4" />
                    {text("原谱跟随", "Follow original")}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/practice/$pieceId" params={{ pieceId: p.id }} search={{ mode: "ai" }}>
                    <Music2 className="size-4" />
                    {p.transcribe_status === "ready" ? text("AI 识谱 · 可练习", "AI notation · Ready") : text("AI 识谱", "AI notation")}
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
