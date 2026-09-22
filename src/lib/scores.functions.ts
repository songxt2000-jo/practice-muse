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
        "只列出在这些页面中【开始】的独立曲目（每首曲子标题通常在页面顶部）。" +
        "目录页(Contents/Index)里的条目也可以使用，但请用其中标注的页码。" +
        "如果某页只是上一首曲子的延续，不要产生新条目。" +
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
