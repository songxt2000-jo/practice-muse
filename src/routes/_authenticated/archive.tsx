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
import { useLanguage, useLocalizedDocumentTitle } from "@/lib/i18n";
import { MyCollections } from "@/components/my-collections";

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
  const { text } = useLanguage();
  useLocalizedDocumentTitle("曲库 · 琴谱工作台", "Library · Piano Workbench");
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [mode, setMode] = useState<"pdf" | "images">("pdf");

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
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error(text("请先登录", "Please log in first"));

      if (mode === "images") {
        const files = Array.from(imageRef.current?.files ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );
        if (!files.length) throw new Error(text("请选择至少一张乐谱图片", "Choose at least one score image"));
        if (files.length > 100) throw new Error(text("一次最多上传 100 张图片", "You can upload up to 100 images at once"));

        const folder = `${uid}/${crypto.randomUUID()}`;
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i]!;
          const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
          const name = `p${String(i + 1).padStart(3, "0")}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("scores")
            .upload(`${folder}/${name}`, file, {
              contentType: file.type || "image/jpeg",
            });
          if (uploadError) throw uploadError;
        }

        const { data, error } = await supabase
          .from("books")
          .insert({
            user_id: uid,
            title: title.trim() || files[0]!.name.replace(/\.[^.]+$/, ""),
            composer: composer.trim() || null,
            storage_path: folder,
            source_type: "images",
            page_count: files.length,
            scan_status: "pending",
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error(text("请选择一个 PDF 文件", "Choose a PDF file"));

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
          source_type: "pdf",
          page_count: pageCount,
          scan_status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(text("已上传，进入书内即可开始识别曲目。", "Uploaded. Open the collection to organize its pieces."));
      setTitle("");
      setComposer("");
      if (fileRef.current) fileRef.current.value = "";
      if (imageRef.current) imageRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : text("上传失败", "Upload failed")),
  });

  return (
    <AppShell>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <h1 className="text-3xl">{text("我的曲库", "My library")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {text("每本曲集可以自动拆分出曲目，点开曲目再按需识谱。", "Organize every collection into pieces, then transcribe only what you need.")}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {booksQuery.isLoading && <p className="text-sm text-muted-foreground">{text("载入中…", "Loading…")}</p>}
            {booksQuery.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">{text("还没有曲集，先上传一本 PDF 或几张乐谱图片吧。", "No collections yet. Upload a PDF or score images to begin.")}</p>
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
                  {book.composer ?? text("未知作曲家", "Unknown composer")} · {book.page_count} {text("页", "pages")}
                </p>
                <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">
                  {book.scan_status === "ready" ? text("已拆书", "Organized") : text("待拆书", "Not organized")}
                </p>
              </Link>
            ))}
          </div>
          <MyCollections />
        </section>

        <aside className="surface-salon h-fit rounded-xl p-5">
          <h2 className="text-xl">{text("上传乐谱", "Upload scores")}</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === "pdf" ? "default" : "outline"}
              onClick={() => setMode("pdf")}
            >
              {text("PDF 曲集", "PDF collection")}
            </Button>
            <Button
              type="button"
              variant={mode === "images" ? "default" : "outline"}
              onClick={() => setMode("images")}
            >
              {text("乐谱图片", "Score images")}
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="title">{text("书名 / 曲名（可留空）", "Collection / piece title (optional)")}</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="composer">{text("作曲家 / 编者", "Composer / editor")}</Label>
              <Input id="composer" value={composer} onChange={(e) => setComposer(e.target.value)} />
            </div>
            {mode === "pdf" ? (
              <div className="space-y-2">
                <Label htmlFor="pdf">{text("PDF 文件", "PDF file")}</Label>
                <Input id="pdf" ref={fileRef} type="file" accept="application/pdf" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="images">{text("乐谱图片（可多选 / 拍照）", "Score images (select multiple or take photos)")}</Label>
                <Input id="images" ref={imageRef} type="file" accept="image/*" multiple />
                <p className="text-xs text-muted-foreground">
                  {text("支持扫描版乐谱图片，也可以直接拍纸质谱子。多张图片会按文件名顺序当作连续页面。", "Use scanned score images or photos of paper music. Multiple images are ordered by filename as consecutive pages.")}
                </p>
              </div>
            )}
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
              {text("上传", "Upload")}
            </Button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
