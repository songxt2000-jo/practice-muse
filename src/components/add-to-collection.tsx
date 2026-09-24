import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, name, description, created_at, collection_items(piece_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export async function createCollection(name: string) {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("collections")
    .insert({ user_id: u.user!.id, name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export function AddToCollection({ pieceId }: { pieceId: string }) {
  const { text } = useLanguage();
  const qc = useQueryClient();
  const collections = useCollections();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  function showFlash(name: string) {
    setFlash(name);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1900);
  }

  async function toggle(collectionId: string, inIt: boolean, count: number) {
    setBusy(true);
    try {
      if (inIt) {
        const { error } = await supabase
          .from("collection_items")
          .delete()
          .eq("collection_id", collectionId)
          .eq("piece_id", pieceId);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("collection_items").insert({
          user_id: u.user!.id,
          collection_id: collectionId,
          piece_id: pieceId,
          sort_order: count,
        });
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["collections"] });
      void qc.invalidateQueries({ queryKey: ["collection", collectionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : text("操作失败", "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const id = await createCollection(name);
      setNewName("");
      await toggle(id, false, 0);
      toast.success(text(`已加入「${name}」`, `Added to “${name}”`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : text("创建失败", "Could not create"));
      setBusy(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={text("加入自建曲集", "Add to my collection")}>
          <ListPlus className="size-4" />
          {text("加入曲集", "Add to set")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <p className="text-sm font-medium">{text("加入自建曲集", "Add to my collection")}</p>
        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
          {collections.data?.length === 0 && (
            <p className="text-xs text-muted-foreground">{text("还没有自建曲集，在下面新建一个。", "No collections yet — create one below.")}</p>
          )}
          {collections.data?.map((c) => {
            const inIt = c.collection_items.some((i) => i.piece_id === pieceId);
            return (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={inIt}
                  disabled={busy}
                  onCheckedChange={() => toggle(c.id, inIt, c.collection_items.length)}
                />
                <span className="truncate">{c.name}</span>
              </label>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
            placeholder={text("新曲集名称", "New collection name")}
            className="h-8"
          />
          <Button size="sm" onClick={createAndAdd} disabled={busy || !newName.trim()} aria-label={text("新建并加入", "Create and add")}>
            <Plus className="size-4" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
