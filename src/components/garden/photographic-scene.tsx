import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";

export type GardenStage = 0 | 1 | 2;
const frames = ["piano-wide.png", "piano-open.png", "piano-macro.png"];

type Props = {
  stage: GardenStage;
  titles: string[];
  selected: number;
  entering: boolean;
  onApproach: () => void;
  onHover: (index: number | null) => void;
  onPlay: (index: number) => void;
};

/** Photographic plates with image-aligned interaction regions, not a 3D model. */
export function PhotographicScene({
  stage,
  titles,
  selected,
  entering,
  onApproach,
  onHover,
  onPlay,
}: Props) {
  const { text } = useLanguage();
  const host = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<boolean[]>([false, false, false]);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (loaded[stage]) setShown(stage);
  }, [loaded, stage]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      element.style.setProperty("--plate-width", `${Math.max(width, (height * 1672) / 941)}px`);
      element.style.setProperty("--plate-height", `${Math.max(height, (width * 941) / 1672)}px`);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || matchMedia("(prefers-reduced-motion: reduce)").matches)
        return;
      const r = element.getBoundingClientRect();
      element.style.setProperty(
        "--parallax-x",
        `${((event.clientX - r.left) / r.width - 0.5) * -8}px`,
      );
      element.style.setProperty(
        "--parallax-y",
        `${((event.clientY - r.top) / r.height - 0.5) * -5}px`,
      );
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", move);
    };
  }, []);
  return (
    <div className="garden-photographic-scene" ref={host} data-shot={shown}>
      {frames.map((file, index) => (
        <div
          key={file}
          className={`garden-photo-frame ${shown === index ? "is-visible" : ""}`}
          aria-hidden={shown !== index}
        >
          <div className="garden-photo-plate">
            <img
              src={`/garden/${file}`}
              alt=""
              width={1672}
              height={941}
              decoding="async"
              fetchPriority={index === 0 ? "high" : "low"}
              onLoad={() => setLoaded((old) => old.map((value, i) => (i === index ? true : value)))}
              onError={() => setFailed(true)}
            />
            {index === 0 && stage === 0 && (
              <button
                className="garden-piano-region"
                tabIndex={shown === 0 ? 0 : -1}
                onClick={onApproach}
                aria-label={text("靠近钢琴", "Approach the piano")}
              >
                <span className="garden-photo-marker">
                  ＋<small>APPROACH</small>
                </span>
              </button>
            )}
            {index === 2 && stage === 2 && (
              <div className="garden-hammer-regions">
                {titles.slice(0, 28).map((title, i) => (
                  <button
                    key={i}
                    className={`garden-hammer-region ${selected === i ? "is-selected" : ""} ${entering && selected === i ? "is-striking" : ""}`}
                    style={{ left: `${65 + i * 1.12}%`, top: `${61 + i * 1.12}%` }}
                    aria-label={text(`开始练习：${title}`, `Practice: ${title}`)}
                    title={title}
                    disabled={entering}
                    tabIndex={shown === 2 ? 0 : -1}
                    onPointerEnter={() => onHover(i)}
                    onPointerLeave={() => onHover(null)}
                    onFocus={() => onHover(i)}
                    onBlur={() => onHover(null)}
                    onClick={() => onPlay(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="garden-dust" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 23) % 95}%`,
              animationDelay: `${i * -0.8}s`,
              animationDuration: `${10 + (i % 7)}s`,
            }}
          />
        ))}
      </div>
      {failed && (
        <span className="garden-image-error" role="status">
          {text(
            "部分场景画面未载入，仍可使用页面操作。",
            "Some scene images could not load. All page controls remain available.",
          )}
        </span>
      )}
    </div>
  );
}
