import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function SiteHeader({ authenticated = false }: { authenticated?: boolean }) {
  const { language, setLanguage, text } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto grid min-h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-5">
        <div className="flex items-center justify-start">
          <div className="inline-flex items-center rounded-md border border-border bg-secondary/60 p-0.5" aria-label={text("选择语言", "Choose language")}>
            <Languages className="ml-2 size-4 text-muted-foreground" aria-hidden="true" />
            {(["zh", "en"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={language === option ? "default" : "ghost"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setLanguage(option)}
                aria-pressed={language === option}
              >
                {option === "zh" ? "中文" : "EN"}
              </Button>
            ))}
          </div>
        </div>

        <Link to={authenticated ? "/archive" : "/"} className="text-center">
          <span className="block text-lg leading-none sm:text-xl" style={{ fontFamily: "var(--font-display)" }}>
            {text("琴谱工作台", "Piano Workbench")}
          </span>
          <span className="mt-1 hidden text-[9px] uppercase tracking-[0.3em] text-muted-foreground sm:block">
            Practice Studio
          </span>
        </Link>

        <div className="flex items-center justify-end gap-1 sm:gap-2">
          {authenticated ? (
            <>
              <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                <Link to="/history">{text("练习记录", "History")}</Link>
              </Button>
              <Button variant="secondary" size="sm" className="px-2 sm:px-3" onClick={signOut}>
                {text("退出", "Sign out")}
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                <Link to="/auth" search={{ mode: "signin" }}>{text("登录", "Log in")}</Link>
              </Button>
              <Button asChild size="sm" className="px-2 sm:px-3">
                <Link to="/auth" search={{ mode: "signup" }}>{text("注册", "Sign up")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}