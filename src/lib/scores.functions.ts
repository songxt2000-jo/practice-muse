import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { streamText, Output } from "ai";
import { z } from "zod";

const PageImage = z.object({
  page: z.number().int().positive(),
  dataUrl: z.string().min(20),
});

const ScanInput = z.object({
  pages: z.array(PageImage).min(1).max(12),
  totalPages: z.number().int().positive(),
});

const TocSchema = z.object({
  entries: z.array(
    z.object({
      title: z.string(),
      composer: z.string().nullable(),
      startPage: z.number().int(),
      endPage: z.number().int().nullable(),
      era: z.string().nullable(),
      mood: z.string().nullable(),
      keySignature: z.string().nullable(),
    }),
  ),
});

function imageMessage(text: string, pages: Array<{ page: number; dataUrl: string }>) {
  return [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text },
        ...pages.flatMap((p) => [
          { type: "text" as const, text: `第 ${p.page} 页：` },
          { type: "image" as const, image: p.dataUrl },
        ]),
      ],
    },
  ];
}

/** Scan a batch of page images and report every piece that STARTS in this batch. */
export const scanBookPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScanInput.parse(input))
  .handler(async ({ data }) => {
    const { createResponsesModel, responsesProviderOptions } = await import("./ai-gateway.server");

    const result = streamText({
      model: createResponsesModel(),
      system:
        "你是一位资深钢琴谱编目专家。你会看到一本钢琴曲集中若干页的图片。" +
        "只列出在这些页面中【开始】的、真正可以完整演奏的独立乐曲。" +
        "【必须忽略】：封面、版权页、前言/编者按/序言、乐理与演奏技巧讲解、历史与版本考证、" +
        "致谢、广告页、纯文字页、以及任何主体不是五线谱的页面。" +
        "【必须忽略】：音阶、琶音、指法预备练习、装饰音示范、教师示范小节、伴奏示范等" +
        "只有几小节的零散练习片段或辅助谱例（通常不足半页、无独立曲名）。" +
        "【收录标准】：页面主体是完整的大谱表(Grand Staff)，有明确的曲名或作品号(Op./No.)，" +
        "有调号拍号，且乐曲至少占据大半页或跨页。" +
        "目录页(Contents/Index)里的条目可以作为参考，但只收录其中的正式乐曲，并使用其中标注的页码。" +
        "如果某页只是上一首曲子的延续，不要产生新条目。" +
        "宁可漏掉可疑条目，也不要把非乐曲内容当成曲目。" +
        `全书共 ${data.totalPages} 页。endPage 未知时填 null。`,
      messages: imageMessage("请识别下列页面中开始的曲目。", data.pages),
      output: Output.object({ schema: TocSchema }),
      providerOptions: responsesProviderOptions,
    });

    return await result.output;
  });

const TranscribeInput = z.object({
  pieceId: z.string().uuid(),
  title: z.string(),
  pages: z.array(PageImage).min(1).max(8),
});

const AbcSchema = z.object({
  abc: z.string(),
  keySignature: z.string().nullable(),
  meter: z.string().nullable(),
  suggestedTempo: z.number().int().nullable(),
  era: z.string().nullable(),
  mood: z.string().nullable(),
  composer: z.string().nullable(),
  background: z.string().nullable(),
  story: z.string().nullable(),
});

/** Turn the pages of one piece into ABC notation +背景故事, and store it. */
export const transcribePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TranscribeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { createResponsesModel, responsesProviderOptions } = await import("./ai-gateway.server");

    const result = streamText({
      model: createResponsesModel(),
      system:
        "你是专业的钢琴乐谱 OCR 与 ABC 记谱法专家。把图片中的五线谱转写为可被 abcjs 正确渲染和播放的 ABC 记谱法。" +
        "要求：使用 %%score (V1) (V2) 双谱表，V1 为右手(treble)、V2 为左手(bass)；" +
        "写出 X:1 T: C: M: L: Q: K: 头部；小节线完整；尽量保留力度与连线；" +
        "【只转写学生声部】：教学版曲谱常在页面下方附有 Teacher Duet / 教师伴奏 / 二重奏部分，" +
        "通常字号和谱表明显更小、标有 R.H./L.H. 或 Teacher Duet 字样，这部分一律忽略，不要转写进 ABC。" +
        "如果某些细节无法辨认，用最合理的音符补全，保证 ABC 语法有效。" +
        "另外补充这首曲子的作曲家、年代、情绪，以及一段 100-200 字的中文创作背景与故事剧情。",
      messages: imageMessage(`曲目《${data.title}》的乐谱页面如下，请转写。`, data.pages),
      output: Output.object({ schema: AbcSchema }),
      providerOptions: responsesProviderOptions,
    });

    const out = await result.output;

    const { error } = await context.supabase
      .from("pieces")
      .update({
        abc_notation: out.abc,
        key_signature: out.keySignature,
        era: out.era,
        mood: out.mood,
        composer: out.composer,
        background: out.background,
        story: out.story,
        default_tempo: out.suggestedTempo ?? 90,
        transcribe_status: "ready",
      })
      .eq("id", data.pieceId)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);

    return out;
  });
