import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-xs uppercase tracking-[0.4em] text-primary">Piano Practice Studio</p>
      <h1 className="mt-6 max-w-3xl text-5xl leading-tight md:text-6xl">
        把整本琴谱，变成会发声的练习室
      </h1>
      <p className="mt-6 max-w-xl text-muted-foreground">
        上传一本 80–100 页的 PDF 曲集，自动扫出曲目目录；点开任意一首，即时识谱为五线谱，
        配合真实钢琴音色、节拍器、虚拟键盘与选段循环开始练习。
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link to="/archive">进入曲库</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link to="/auth">登录 / 注册</Link>
        </Button>
      </div>
      <div className="mt-16 grid max-w-3xl gap-4 text-left md:grid-cols-3">
        {[
          ["拆书", "AI 扫描整本曲集，给出每首曲子的起止页。"],
          ["识谱", "按需把对应页转成 ABC 乐谱，可播放可跳转。"],
          ["练习", "40–208 BPM、节拍器、AB 选段循环与练习计时。"],
        ].map(([title, desc]) => (
          <div key={title} className="surface-salon rounded-xl p-5">
            <h3 className="text-xl">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
