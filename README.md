# Practice Muse

我想制作一个专为钢琴练习者设计的智能交互式琴谱工作台（技术栈：TanStack Start + React 19 + Tailwind CSS + Lovable Cloud + abcjs + pdfjs-dist）。

核心功能要求：

1. 账号与曲库（Lovable Cloud）：

   - 支持邮箱密码与社交登录，数据表包含 books、pieces（含作曲家/年代/情感/故事等背景字段）、practice_sessions、practice_session_items。

   - 私有 scores storage 存放用户上传的 PDF。

2. 80-100 页大 PDF 拆书与识谱：

   - 客户端用 pdfjs-dist 渲染缩略图，调用 AI 快速扫出整本书的曲目目录（开始/结束页）。

   - 在 Archive 曲库点击曲目时，按需把对应页送给 AI 转换为 ABC 记谱法代码。

3. 练习界面（Practice Studio）：

   - 使用 abcjs 动态渲染五线谱，内置真实钢琴音色合成播放，40-208 BPM 可调，带独立节拍器。

   - 虚拟钢琴键盘联动：播放时同步高亮对应物理琴键并标音名（C3-C6）。

   - 任意音符/小节点击起播，支持指定小节选段循环（AB Loop）。

   - 乐曲创作背景（作曲家、年代、情绪、故事剧情）放在练习室可折叠抽屉中，供代入情感。

4. 全屏专注模式与八音盒：

   - 一键全屏，带旋转芭蕾天使动效（播放时旋转、暂停惯性渐停），支持隐藏计时器。

   - 练习计时：打开曲子即开始计时，退出时弹窗总结「本次练习共 x 首，共 x 分钟」并入库。

5. 开发实施顺序：

   - 请先帮我把数据表迁移、PDF拆书、按需识谱、曲库列表、带选段循环和计时的练习室这套完整的核心业务功能打通，功能稳定后我们再包装拟物化钢琴交互首页！

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/51ea7302-52ff-41dd-9172-4e892c880a20).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
