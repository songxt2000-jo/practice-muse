import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowLeft,
  Volume2,
  VolumeX,
  Plus,
  Loader2,
  Music2,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage, useLocalizedDocumentTitle } from "@/lib/i18n";
import { uploadScore } from "@/lib/upload-score";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PhotographicScene, type GardenStage } from "./photographic-scene";
import "./garden.css";

export function GardenHome() {
  const { text, language, setLanguage } = useLanguage();
  useLocalizedDocumentTitle("遗世之庭 · 琴谱工作台", "The Garden · Piano Workbench");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<GardenStage>(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [selected, setSelected] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [sound, setSound] = useState(false);
  const [entering, setEntering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const soundContext = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteringRef = useRef(false);
  const sample = useRef<HTMLAudioElement | null>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (live) {
          setUserId(data.session?.user.id ?? null);
          setAuthReady(true);
        }
      })
      .catch(() => {
        if (live) setAuthReady(true);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live) {
        setUserId(session?.user.id ?? null);
        setAuthReady(true);
      }
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const pieces = useQuery({
    queryKey: ["garden-pieces", userId],
    enabled: !!userId && stage === 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pieces")
        .select("id,title,composer,transcribe_status,book_id")
        .eq("user_id", userId!)
        .order("updated_at", { ascending: false })
        .limit(28);
      if (error) throw error;
      return data;
    },
  });
  const practice = useQuery({
    queryKey: ["garden-practice", userId],
    enabled: !!userId,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("practice_session_items")
        .select("seconds")
        .eq("user_id", userId!)
        .gte("created_at", start.toISOString());
      if (error) throw error;
      return (data ?? []).reduce((sum, item) => sum + item.seconds, 0);
    },
  });
  const list = pieces.data ?? [];
  const activePiece = list[selected];
  const hoveredPiece = hover === null ? undefined : list[hover];

  const startPractice = useCallback(
    (index: number) => {
      const piece = pieces.data?.[index];
      if (!piece || enteringRef.current) return;
      enteringRef.current = true;
      setSelected(index);
      setEntering(true);
      if (!sample.current) sample.current = new Audio("/garden/piano-c4.mp3");
      sample.current.currentTime = 0;
      void sample.current.play().catch(() => {});
      timer.current = setTimeout(
        () => {
          void navigate({ to: "/practice/$pieceId", params: { pieceId: piece.id } }).catch(() => {
            enteringRef.current = false;
            setEntering(false);
            toast.error(
              text(
                "暂时无法进入练习室，请重试。",
                "Could not open the practice room. Please retry.",
              ),
            );
          });
        },
        matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 750,
      );
    },
    [navigate, pieces.data, text],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      sample.current?.pause();
    },
    [],
  );
  useEffect(() => {
    setHover(null);
    if (stage > 0) panel.current?.focus({ preventScroll: true });
  }, [stage]);

  useEffect(() => {
    if (!sound) return;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      soundContext.current = context;
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const channel = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < channel.length; i++) {
        previous = (previous + Math.random() * 0.04 - 0.02) / 1.02;
        channel[i] = previous;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      const gain = context.createGain();
      gain.gain.value = 0.18;
      source.connect(filter).connect(gain).connect(context.destination);
      source.start();
      void context.resume().catch(() => setSound(false));
    } catch {
      setSound(false);
    }
    return () => {
      if (context && context.state !== "closed") void context.close();
      soundContext.current = null;
    };
  }, [sound]);

  const upload = useMutation({
    mutationFn: () => uploadScore({ files, title }),
    onSuccess: (book) => {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success(
        text("乐谱已摆放，接下来整理曲目。", "Score uploaded. Organize its pieces next."),
      );
      void navigate({ to: "/books/$bookId", params: { bookId: book.id } });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : text("上传失败，请重试。", "Upload failed. Please retry."),
      ),
  });
  function chooseFiles(chosen: File[]) {
    if (upload.isPending) return;
    setFiles(chosen);
    if (chosen[0]) setTitle(chosen[0].name.replace(/\.[^.]+$/, ""));
  }

  return (
    <div className="garden-home" data-stage={stage} data-entering={entering}>
      <PhotographicScene
        stage={stage}
        titles={list.map((piece) => piece.title)}
        selected={hover ?? selected}
        entering={entering}
        onApproach={() => setStage(1)}
        onHover={setHover}
        onPlay={startPractice}
      />
      <div className="garden-shade" aria-hidden="true" />
      <div className="garden-grain" aria-hidden="true" />
      <header className="garden-header">
        <Link to="/" className="garden-brand" onClick={() => setStage(0)}>
          <span className="garden-mark" aria-hidden="true">
            Ⅱ
          </span>
          <span>
            {text("琴谱工作台", "Piano Workbench")}
            <small>THE QUIET GARDEN</small>
          </span>
        </Link>
        <span className="garden-motto">A QUIET PLACE TO BEGIN AGAIN</span>
        <nav aria-label={text("首页导航", "Home navigation")}>
          <button
            onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
            aria-label={text("Switch to English", "切换为中文")}
          >
            {language === "zh" ? "EN" : "中文"}
          </button>
          <Link to="/archive">
            {text("直接进入曲库", "Skip to library")} <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main>
        <section
          className="garden-panel"
          ref={panel}
          tabIndex={-1}
          aria-labelledby="garden-heading"
          key={stage}
        >
          <div className="garden-eyebrow">
            <span />
            {["THE FORGOTTEN GARDEN", "THE UNFOLDING", "THE REPERTOIRE"][stage]}
          </div>
          {stage === 0 ? (
            <>
              <h1 id="garden-heading">
                {text("万物归于寂静。", "The world falls quiet.")}
                <br />
                {text("而你，唤醒回响。", "You bring it to life.")}
              </h1>
              <p>
                {text("让世界慢下来。", "Let the world slow down.")}
                <br />
                {text("今天的第一颗音符，从这里开始。", "Your first note of today begins here.")}
              </p>
              <Button className="garden-primary garden-plain" onClick={() => setStage(1)}>
                {text("靠近钢琴", "APPROACH")}
                <ArrowUpRight />
              </Button>
              <small className="garden-hint">APPROACH THE PIANO</small>
            </>
          ) : stage === 1 ? (
            <>
              <h1 id="garden-heading">{text("让旋律，有所归处。", "A home for your music.")}</h1>
              <p>{text("将你的乐谱，轻轻放在这里。", "Place your score on the music stand.")}</p>
              {!authReady ? (
                <p role="status">{text("正在打开琴房…", "Opening your studio…")}</p>
              ) : !userId ? (
                <div className="garden-auth-card">
                  <Music2 />
                  <p>
                    {text(
                      "登录后，摆放乐谱并找回你的曲目。",
                      "Sign in to place scores and return to your music.",
                    )}
                  </p>
                  <Button asChild className="garden-primary">
                    <Link to="/auth" search={{ mode: "signin" }}>
                      {text("登录琴房", "Sign in")}
                      <ArrowUpRight />
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    multiple
                    hidden
                    onChange={(e) => chooseFiles(Array.from(e.target.files ?? []))}
                  />
                  <button
                    className={`garden-dropzone ${dragging ? "is-dragging" : ""}`}
                    disabled={upload.isPending}
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      chooseFiles(Array.from(e.dataTransfer.files));
                    }}
                  >
                    <Plus size={28} />
                    <strong>
                      {files.length
                        ? text(`已选 ${files.length} 个文件`, `${files.length} file(s) selected`)
                        : text("摆放乐谱", "Place scores")}
                    </strong>
                    <span>
                      {text(
                        "一份 PDF 或多张 JPG / PNG / WebP",
                        "One PDF or multiple JPG / PNG / WebP images",
                      )}
                    </span>
                  </button>
                  {files.length > 0 && (
                    <div className="garden-upload-details">
                      <label htmlFor="garden-score-title">
                        {text("曲集名称", "Collection title")}
                      </label>
                      <Input
                        id="garden-score-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={upload.isPending}
                      />
                      <Button
                        className="garden-primary"
                        disabled={upload.isPending}
                        onClick={() => upload.mutate()}
                      >
                        {upload.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Upload size={16} />
                        )}
                        {upload.isPending
                          ? text("正在摆放…", "Uploading…")
                          : text("上传并整理曲目", "Upload and organize")}
                      </Button>
                    </div>
                  )}
                </>
              )}
              <button
                className="garden-text-button"
                disabled={upload.isPending}
                onClick={() => setStage(2)}
              >
                {text("探索琴弦中的曲目", "Explore your repertoire")} <ArrowUpRight size={16} />
              </button>
            </>
          ) : (
            <>
              <h1 id="garden-heading">
                {text("每一次触碰，", "Every note,")}
                <br />
                {text("都是一次重逢。", "a familiar embrace.")}
              </h1>
              <p>
                {text(
                  "选择一首曲目，唤醒它的第一颗音符。",
                  "Choose a piece. Awaken its first note.",
                )}
              </p>
              {!authReady || (userId && pieces.isPending) ? (
                <p role="status">
                  <Loader2 className="animate-spin inline" size={16} />{" "}
                  {text("正在寻找你的旋律…", "Finding your music…")}
                </p>
              ) : !userId ? (
                <Button asChild className="garden-primary">
                  <Link to="/auth" search={{ mode: "signin" }}>
                    {text("登录，找回你的曲目", "Sign in to find your music")}
                    <ArrowUpRight />
                  </Link>
                </Button>
              ) : pieces.isError ? (
                <div role="alert">
                  <p>{text("曲库暂时没有回应。", "Your library could not be loaded.")}</p>
                  <button className="garden-text-button" onClick={() => void pieces.refetch()}>
                    {text("重新载入", "Try again")}
                  </button>
                </div>
              ) : list.length === 0 ? (
                <div className="garden-auth-card">
                  <p>
                    {text(
                      "这里正等待你的第一首曲目。上传乐谱后，在曲集中整理曲目即可。",
                      "Your first piece belongs here. Upload a score and organize its pieces to begin.",
                    )}
                  </p>
                  <button className="garden-text-button" onClick={() => setStage(1)}>
                    <Plus size={16} />
                    {text("摆放乐谱", "Place scores")}
                  </button>
                  <Link className="garden-text-button" to="/archive">
                    {text("整理已有曲集", "Organize existing scores")}
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
              ) : (
                <>
                  <div
                    className="garden-tracks"
                    aria-label={text("最近更新的曲目", "Recently updated pieces")}
                  >
                    {list.map((piece, i) => (
                      <button
                        key={piece.id}
                        className={`garden-track ${selected === i ? "is-selected" : ""}`}
                        aria-pressed={selected === i}
                        onClick={() => setSelected(i)}
                        onPointerEnter={() => {
                          setHover(i);
                        }}
                        onPointerLeave={() => {
                          setHover(null);
                        }}
                      >
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <span>
                          <strong>{piece.title}</strong>
                          <small>{piece.composer || text("未知作曲家", "Unknown composer")}</small>
                        </span>
                        <Music2 size={16} />
                      </button>
                    ))}
                  </div>
                  <Button
                    className="garden-primary"
                    disabled={!activePiece || entering}
                    onClick={() => startPractice(selected)}
                  >
                    {entering
                      ? text("走进练习室…", "Entering…")
                      : text("开始练习", "Begin practice")}
                    <ArrowUpRight />
                  </Button>
                  <Link className="garden-text-button" to="/archive">
                    {text("查看完整曲库", "View full library")}
                    <ArrowUpRight size={16} />
                  </Link>
                </>
              )}
            </>
          )}
        </section>
        {stage === 2 && hoveredPiece && (
          <div className="garden-score-card" aria-hidden="true">
            <Music2 size={18} />
            <span>
              {hoveredPiece.title}
              <small>{hoveredPiece.composer}</small>
            </span>
          </div>
        )}
      </main>
      <footer className="garden-footer">
        <div className="garden-chapter">
          <span>0{stage + 1}</span>
          <i />
          <span>
            {
              [
                text("遗世之庭", "The garden"),
                text("启封仪式", "The unfolding"),
                text("琴弦曲库", "The repertoire"),
              ][stage]
            }
            <small>{["THE GARDEN", "THE UNFOLDING", "THE REPERTOIRE"][stage]}</small>
          </span>
        </div>
        <p>
          {practice.data
            ? text(
                `今日已练习 ${Math.max(1, Math.round(practice.data / 60))} 分钟`,
                `${Math.max(1, Math.round(practice.data / 60))} minutes practiced today`,
              )
            : text("今天，也为自己弹奏。", "Play a little for yourself today.")}
        </p>
        <div>
          {stage > 0 && (
            <button
              disabled={upload.isPending || entering}
              onClick={() => setStage((stage - 1) as GardenStage)}
              aria-label={text("返回上一个镜头", "Previous scene")}
            >
              <ArrowLeft size={16} />
              {text("返回", "Back")}
            </button>
          )}
          <button onClick={() => setSound(!sound)} aria-pressed={sound}>
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            {text("环境音", "Ambience")} · {sound ? text("开", "On") : text("关", "Off")}
          </button>
        </div>
      </footer>
      <div className="garden-flash" aria-hidden="true" />
    </div>
  );
}
