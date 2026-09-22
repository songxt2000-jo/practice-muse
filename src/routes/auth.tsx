import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "登录 · 琴谱工作台" },
      { name: "description", content: "登录你的钢琴琴谱工作台，管理曲库与练习记录。" },
      { property: "og:title", content: "登录 · 琴谱工作台" },
      { property: "og:description", content: "登录你的钢琴琴谱工作台，管理曲库与练习记录。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/archive", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("注册成功，请到邮箱点击确认链接后登录。");
          setMode("signin");
          return;
        }
        navigate({ to: "/archive" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/archive" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google 登录失败，请稍后再试。");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/archive" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="surface-salon w-full max-w-md rounded-2xl p-8">
        <Link to="/" className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          琴谱工作台
        </Link>
        <h1 className="mt-3 text-3xl">{mode === "signin" ? "回到琴房" : "创建你的琴房"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          上传曲集、拆分曲目、进入练习室。
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "登录" : "注册"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          或
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="secondary" className="w-full" onClick={handleGoogle}>
          使用 Google 账号继续
        </Button>

        <button
          type="button"
          className="mt-6 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "还没有账号？立即注册" : "已有账号？直接登录"}
        </button>
      </div>
    </div>
  );
}
