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
  destroy: () => void;
};

export async function loadPdf(source: ArrayBuffer | Uint8Array): Promise<LoadedPdf> {
  await ensureWorker();
  const data = source instanceof Uint8Array ? source : new Uint8Array(source);
  const doc = await pdfjsLib.getDocument({ data }).promise;

  return {
    numPages: doc.numPages,
    renderPage: async (pageNumber: number, targetWidth = 900) => {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = targetWidth / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas unavailable");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      return canvas.toDataURL("image/jpeg", 0.72);
    },
    destroy: () => {
      void (doc as unknown as { destroy: () => Promise<void> }).destroy();
    },
  };
}
