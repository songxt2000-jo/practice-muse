// Browser-only helpers around pdfjs-dist. Import lazily from client code.
import * as pdfjsLib from "pdfjs-dist";

let workerReady = false;

async function ensureWorker() {
  if (workerReady) return;
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  workerReady = true;
}

export type LoadedPdf = {
  numPages: number;
  renderPage: (pageNumber: number, targetWidth?: number) => Promise<string>;
  /** Raw pixels for image analysis. Annotations (pen marks) are left out. */
  renderPageImage: (pageNumber: number, targetWidth?: number) => Promise<ImageData>;
  destroy: () => void;
};

export async function loadPdf(source: ArrayBuffer | Uint8Array): Promise<LoadedPdf> {
  await ensureWorker();
  const data = source instanceof Uint8Array ? source : new Uint8Array(source);
  const loadingTask = pdfjsLib.getDocument({ data });
  const doc = await loadingTask.promise;

  const draw = async (pageNumber: number, targetWidth: number, annotations: boolean) => {
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = targetWidth / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: !annotations });
    if (!context) throw new Error("canvas unavailable");
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      annotationMode: annotations ? pdfjsLib.AnnotationMode.ENABLE : pdfjsLib.AnnotationMode.DISABLE,
    }).promise;
    return { canvas, context };
  };

  return {
    numPages: doc.numPages,
    renderPage: async (pageNumber: number, targetWidth = 900) => {
      const { canvas } = await draw(pageNumber, targetWidth, true);
      return canvas.toDataURL("image/jpeg", 0.72);
    },
    renderPageImage: async (pageNumber: number, targetWidth = 1200) => {
      const { canvas, context } = await draw(pageNumber, targetWidth, false);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    },
    destroy: () => {
      const maybe = doc as unknown as { cleanup?: () => unknown; destroy?: () => unknown };
      try {
        void maybe.cleanup?.();
      } catch {
        // ignore
      }
      try {
        void maybe.destroy?.();
      } catch {
        // ignore
      }
      try {
        void (loadingTask as unknown as { destroy?: () => unknown }).destroy?.();
      } catch {
        // ignore
      }
    },
  };
}
