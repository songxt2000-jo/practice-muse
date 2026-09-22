import { supabase } from "@/integrations/supabase/client";
import { loadPdf, type LoadedPdf } from "@/lib/pdf";

const cache = new Map<string, Promise<LoadedPdf>>();

/** Download a private score PDF once per session and keep it ready for rendering. */
export function openBookPdf(storagePath: string): Promise<LoadedPdf> {
  const existing = cache.get(storagePath);
  if (existing) return existing;

  const promise = (async () => {
    const { data, error } = await supabase.storage.from("scores").download(storagePath);
    if (error || !data) throw new Error(error?.message ?? "无法下载曲集文件");
    return loadPdf(await data.arrayBuffer());
  })();

  cache.set(storagePath, promise);
  promise.catch(() => cache.delete(storagePath));
  return promise;
}
