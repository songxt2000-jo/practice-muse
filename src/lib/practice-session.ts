import { supabase } from "@/integrations/supabase/client";

const KEY = "practice-session-id";

/** One practice session spans the whole visit; each piece adds an item. */
export async function getOrCreateSession(): Promise<string> {
  const existing = sessionStorage.getItem(KEY);
  if (existing) return existing;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("未登录");
  const { data, error } = await supabase
    .from("practice_sessions")
    .insert({ user_id: uid })
    .select("id")
    .single();
  if (error) throw error;
  sessionStorage.setItem(KEY, data.id);
  return data.id;
}

export async function recordPiecePractice(input: {
  pieceId: string;
  pieceTitle: string;
  seconds: number;
  tempo: number;
  loopFrom: number | null;
  loopTo: number | null;
}) {
  if (input.seconds < 5) return null;
  const sessionId = await getOrCreateSession();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user!.id;

  await supabase.from("practice_session_items").insert({
    user_id: uid,
    session_id: sessionId,
    piece_id: input.pieceId,
    piece_title: input.pieceTitle,
    seconds: input.seconds,
    tempo: input.tempo,
    loop_from: input.loopFrom,
    loop_to: input.loopTo,
  });

  const { data: items } = await supabase
    .from("practice_session_items")
    .select("piece_id, seconds")
    .eq("session_id", sessionId);

  const totalSeconds = (items ?? []).reduce((sum, item) => sum + item.seconds, 0);
  const pieceCount = new Set((items ?? []).map((item) => item.piece_id)).size;

  await supabase
    .from("practice_sessions")
    .update({ total_seconds: totalSeconds, piece_count: pieceCount })
    .eq("id", sessionId);

  return { totalSeconds, pieceCount };
}

export async function finishSession() {
  const sessionId = sessionStorage.getItem(KEY);
  if (!sessionId) return;
  await supabase
    .from("practice_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId);
  sessionStorage.removeItem(KEY);
}
