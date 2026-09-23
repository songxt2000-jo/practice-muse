import { supabase } from "@/integrations/supabase/client";
import { openBookPdf } from "@/lib/book-pdf";

export type BookSource = {
  numPages: number;
  renderPage: (pageNumber: number, targetWidth?: number) => Promise<string>;
  /** Raw pixels for image analysis (PDF pen annotations left out). */
  renderPageImage: (pageNumber: number, targetWidth?: number) => Promise<ImageData>;
};

const imageCache = new Map<string, Promise<BookSource>>();

async function drawScaled(blob: Blob, targetWidth: number) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, targetWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { canvas, context };
}

async function blobToScaledDataUrl(blob: Blob, targetWidth: number): Promise<string> {
  const { canvas } = await drawScaled(blob, targetWidth);
  return canvas.toDataURL("image/jpeg", 0.78);
}

function openImageFolder(prefix: string): Promise<BookSource> {
  const existing = imageCache.get(prefix);
  if (existing) return existing;

  const promise = (async (): Promise<BookSource> => {
    const folder = prefix.replace(/\/$/, "");
    const { data, error } = await supabase.storage
      .from("scores")
      .list(folder, { limit: 200, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(error.message);
    const files = (data ?? []).filter((f) => f.name && !f.name.startsWith("."));
    if (!files.length) throw new Error("这本曲集里没有找到图片");

    const cache = new Map<string, string>();

    const download = async (pageNumber: number) => {
      const file = files[pageNumber - 1];
      if (!file) throw new Error("页码超出范围");
      const { data: blob, error: downloadError } = await supabase.storage
        .from("scores")
        .download(`${folder}/${file.name}`);
      if (downloadError || !blob) throw new Error(downloadError?.message ?? "无法下载图片");
      return { file, blob };
    };

    return {
      numPages: files.length,
      renderPage: async (pageNumber: number, targetWidth = 900) => {
        const key = `${files[pageNumber - 1]?.name}@${targetWidth}`;
        const hit = cache.get(key);
        if (hit) return hit;
        const { blob } = await download(pageNumber);
        const url = await blobToScaledDataUrl(blob, targetWidth);
        cache.set(key, url);
        return url;
      },
      renderPageImage: async (pageNumber: number, targetWidth = 1200) => {
        const { blob } = await download(pageNumber);
        const { canvas, context } = await drawScaled(blob, targetWidth);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      },
    };
  })();

  imageCache.set(prefix, promise);
  promise.catch(() => imageCache.delete(prefix));
  return promise;
}

/** Open a book whatever its source is: a single PDF, or a folder of page images. */
export async function openBookSource(
  storagePath: string,
  sourceType?: string | null,
): Promise<BookSource> {
  if (sourceType === "images" || storagePath.endsWith("/")) return openImageFolder(storagePath);
  return openBookPdf(storagePath);
}
