import { createFileRoute } from "@tanstack/react-router";
import { GardenHome } from "@/components/garden/garden-home";

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
  component: GardenHome,
});
