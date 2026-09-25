import { supabase } from "@/integrations/supabase/client";

/** The garden follows the existing archive upload protocol and books schema. */
export async function uploadScore(input: { files: File[]; title?: string; composer?: string }) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("请先登录 / Please sign in first");
  const files = [...input.files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  if (!files.length || files.length > 100)
    throw new Error("请选择 1–100 个文件 / Choose 1–100 files");
  const first = files[0]!;
  const pdf = first.type === "application/pdf" || /\.pdf$/i.test(first.name);
  if (pdf && files.length !== 1) throw new Error("每次上传一份 PDF / Upload one PDF at a time");
  if (!pdf && files.some((file) => !/^image\/(jpeg|png|webp)$/.test(file.type))) {
    throw new Error("请选择 PDF、JPG、PNG 或 WebP / Choose PDF, JPG, PNG or WebP");
  }
  let pageCount = files.length;
  if (pdf) {
    const { loadPdf } = await import("@/lib/pdf");
    const document = await loadPdf(await first.arrayBuffer());
    pageCount = document.numPages;
    document.destroy();
  }
  const folder = `${auth.user.id}/${crypto.randomUUID()}`;
  const storagePath = pdf ? `${folder}.pdf` : folder;
  const uploaded: string[] = [];
  try {
    for (const [index, file] of files.entries()) {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = pdf ? storagePath : `${folder}/p${String(index + 1).padStart(3, "0")}.${ext}`;
      const { error } = await supabase.storage
        .from("scores")
        .upload(path, file, { contentType: pdf ? "application/pdf" : file.type });
      if (error) throw error;
      uploaded.push(path);
    }
    const { data, error } = await supabase
      .from("books")
      .insert({
        user_id: auth.user.id,
        title: input.title?.trim() || first.name.replace(/\.[^.]+$/, ""),
        composer: input.composer?.trim() || null,
        storage_path: storagePath,
        source_type: pdf ? "pdf" : "images",
        page_count: pageCount,
        scan_status: "pending",
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    // Only remove this attempt's files; never leave partial uploads behind.
    if (uploaded.length) await supabase.storage.from("scores").remove(uploaded);
    throw error;
  }
}
