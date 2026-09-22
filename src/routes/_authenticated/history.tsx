import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "练习记录 · 琴谱工作台" },
      { name: "description", content: "查看每次练习的时长与曲目数量。" },
      { property: "og:title", content: "练习记录 · 琴谱工作台" },
      { property: "og:description", content: "查看每次练习的时长与曲目数量。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practice_sessions")
        .select("*, practice_session_items(piece_title, seconds)")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <h1 className="text-3xl">练习记录</h1>
      <div className="mt-6 grid gap-3">
        {sessions.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">还没有练习记录。</p>
        )}
        {sessions.data?.map((session) => (
          <div key={session.id} className="surface-salon rounded-xl p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-lg">
                {new Date(session.started_at).toLocaleString("zh-CN")}
              </p>
              <p className="text-sm text-primary">
                {session.piece_count} 首 · {Math.round(session.total_seconds / 60)} 分钟
              </p>
            </div>
            <ul className="mt-2 text-sm text-muted-foreground">
              {session.practice_session_items.map((item, index) => (
                <li key={index}>
                  {item.piece_title} — {Math.round(item.seconds / 60)} 分钟
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
