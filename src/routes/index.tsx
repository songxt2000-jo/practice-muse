import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { useLanguage, useLocalizedDocumentTitle } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "琴谱工作台 · 智能钢琴练习" },
      {
        name: "description",
        content:
          "上传整本钢琴曲集，自动拆分曲目、识谱为可播放乐谱，配合虚拟键盘、节拍器与选段循环练习。",
      },
      { property: "og:title", content: "琴谱工作台 · 智能钢琴练习" },
      {
        property: "og:description",
        content: "上传曲集自动拆书识谱，进入带节拍器与选段循环的练习室。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { text } = useLanguage();
  useLocalizedDocumentTitle("琴谱工作台 · 智能钢琴练习", "Piano Workbench · Intelligent Piano Practice");

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-primary">Piano Practice Studio</p>
        <h1 className="mt-6 max-w-3xl text-5xl leading-tight md:text-6xl">
          {text("把整本琴谱，变成会发声的练习室", "Turn every score into an interactive practice room")}
        </h1>
        <p className="mt-6 max-w-xl text-muted-foreground">
          {text(
            "上传 PDF 曲集或乐谱图片，整理曲目并按需识谱，配合钢琴音色、节拍器、虚拟键盘与选段循环开始练习。",
            "Upload a PDF collection or score images, organize each piece, and practice with piano playback, a metronome, virtual keys, and section looping.",
          )}
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/archive">{text("进入曲库", "Open library")}</Link>
          </Button>
        </div>
        <div className="mt-16 grid max-w-3xl gap-4 text-left md:grid-cols-3">
          {[
            [text("拆书", "Organize"), text("AI 扫描整本曲集，或手动填写每首曲子的页码。", "Let AI scan a collection, or enter each piece's page range yourself.")],
            [text("识谱", "Transcribe"), text("按需把对应页面转换成可播放、可修改的乐谱。", "Turn selected pages into playable, editable notation when needed.")],
            [text("练习", "Practice"), text("使用节拍器、虚拟键盘、原谱跟随与 AB 选段循环。", "Use a metronome, virtual keyboard, original-score following, and AB loops.")],
          ].map(([title, desc]) => (
            <div key={title} className="surface-salon rounded-xl p-5">
              <h3 className="text-xl">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
