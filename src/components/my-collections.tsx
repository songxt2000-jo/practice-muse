import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ListMusic, Plus } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCollection, useCollections } from "@/components/add-to-collection";

export function MyCollections() {
  const { text } = useLanguage();
  const qc = useQueryClient();
  const collections = useCollections();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await createCollection(n);
      setName("");
      void qc.invalidateQueries({ queryKey: ["collections"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : text("创建失败", "Could not create"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl">{text("自建曲集", "My collections")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {text("把不同书里的曲子放到一起，练习时一眼找到。", "Group pieces from different books so they're easy to find.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder={text("新曲集名称", "New collection name")}
            className="w-48"
          />
          <Button onClick={create} disabled={busy || !name.trim()}>
            <Plus className="size-4" />
            {text("新建", "Create")}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {collections.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {text("还没有自建曲集。", "No collections yet.")}
          </p>
        )}
        {collections.data?.map((c) => (
          <Link
            key={c.id}
            to="/collections/$collectionId"
            params={{ collectionId: c.id }}
            className="surface-salon group rounded-xl p-5 transition hover:border-primary"
          >
            <ListMusic className="size-5 text-primary" />
            <h3 className="mt-3 text-xl group-hover:text-primary">{c.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {text(`${c.collection_items.length} 首曲目`, `${c.collection_items.length} pieces`)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
