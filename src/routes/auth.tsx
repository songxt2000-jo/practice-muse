import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { useLanguage, useLocalizedDocumentTitle } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { mode?: "signin" | "signup" } =>
    search["mode"] === "signup" || search["mode"] === "signin" ? { mode: search["mode"] } : {},
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
  const searchMode = Route.useSearch().mode;
  const [mode, setMode] = useState<"signin" | "signup">(searchMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { text } = useLanguage();
  useLocalizedDocumentTitle("登录 · 琴谱工作台", "Sign in · Piano Workbench");

  useEffect(() => {
    if (searchMode) setMode(searchMode);
  }, [searchMode]);

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
          toast.success(text("注册成功，请到邮箱点击确认链接后登录。", "Account created. Confirm your email, then sign in."));
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
      toast.error(error instanceof Error ? error.message : text("操作失败", "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(text("Google 登录失败，请稍后再试。", "Google sign-in failed. Please try again."));
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/archive" });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="surface-salon w-full max-w-md rounded-2xl p-8">
        <Link to="/" className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Piano Workbench</Link>
        <h1 className="mt-3 text-3xl">{mode === "signin" ? text("回到琴房", "Welcome back") : text("创建你的琴房", "Create your studio")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {text("上传曲集、拆分曲目、进入练习室。", "Upload scores, organize pieces, and begin practicing.")}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{text("邮箱", "Email")}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{text("密码", "Password")}</Label>
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
            {mode === "signin" ? text("登录", "Log in") : text("注册", "Sign up")}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {text("或", "or")}
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="secondary" className="w-full" onClick={handleGoogle}>
          {text("使用 Google 账号继续", "Continue with Google")}
        </Button>

        <button
          type="button"
          className="mt-6 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? text("还没有账号？立即注册", "New here? Create an account") : text("已有账号？直接登录", "Already have an account? Log in")}
        </button>
      </div>
      </main>
    </div>
  );
}
