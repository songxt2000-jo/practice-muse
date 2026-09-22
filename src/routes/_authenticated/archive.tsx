import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/archive")({
  head: () => ({
    meta: [
      { title: "曲库 · 琴谱工作台" },
      { name: "description", content: "管理你的钢琴曲集与曲目，上传 PDF 自动拆书。" },
      { property: "og:title", content: "曲库 · 琴谱工作台" },
      { property: "og:description", content: "管理你的钢琴曲集与曲目，上传 PDF 自动拆书。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchivePage,
});

function ArchivePage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");

  const booksQuery = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("请选择一个 PDF 文件");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("请先登录");

      const buffer = await file.arrayBuffer();
      const { loadPdf } = await import("@/lib/pdf");
      const pdf = await loadPdf(buffer.slice(0));
      const pageCount = pdf.numPages;
      try {
        pdf.destroy();
      } catch {
        // 释放失败不影响上传
      }

      const path = `${uid}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("scores")
        .upload(path, file, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("books")
        .insert({
          user_id: uid,
          title: title.trim() || file.name.replace(/\.pdf$/i, ""),
          composer: composer.trim() || null,
          storage_path: path,
          page_count: pageCount,
          scan_status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("曲集已上传，进入书内即可开始拆书。");
      setTitle("");
      setComposer("");
      if (fileRef.current) fileRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "上传失败"),
  });

  return (
    <AppShell>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <h1 className="text-3xl">我的曲库</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            每本曲集可以自动拆分出曲目，点开曲目再按需识谱。
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {booksQuery.isLoading && <p className="text-sm text-muted-foreground">载入中…</p>}
            {booksQuery.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">还没有曲集，先上传一本 PDF 吧。</p>
            )}
            {booksQuery.data?.map((book) => (
              <Link
                key={book.id}
                to="/books/$bookId"
                params={{ bookId: book.id }}
                className="surface-salon group rounded-xl p-5 transition hover:border-primary"
              >
                <BookOpen className="size-5 text-primary" />
                <h2 className="mt-3 text-xl group-hover:text-primary">{book.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {book.composer ?? "未知作曲家"} · {book.page_count} 页
                </p>
                <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">
                  {book.scan_status === "ready" ? "已拆书" : "待拆书"}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <aside className="surface-salon h-fit rounded-xl p-5">
          <h2 className="text-xl">上传曲集</h2>
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="title">书名（可留空）</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="composer">作曲家 / 编者</Label>
              <Input id="composer" value={composer} onChange={(e) => setComposer(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdf">PDF 文件</Label>
              <Input id="pdf" ref={fileRef} type="file" accept="application/pdf" />
            </div>
            <Button
              className="w-full"
              disabled={upload.isPending}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              上传
            </Button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
