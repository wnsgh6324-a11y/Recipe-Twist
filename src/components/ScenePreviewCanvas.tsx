import React, { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import type { AnimationStyle, SceneItem } from "../types/story";
import { renderFrame, type TimedLine } from "../engine/canvasRenderer";
import { decodeWavBase64 } from "../engine/videoComposer";

interface ScenePreviewCanvasProps {
  scene: SceneItem;
  allScenes: SceneItem[];
  style: AnimationStyle;
  timings: TimedLine[];
  onEnsureSceneVoice: (sceneNumber: 1 | 2 | 3 | 4) => Promise<SceneItem | undefined>;
}

export const ScenePreviewCanvas: React.FC<ScenePreviewCanvasProps> = ({
  scene,
  allScenes,
  style,
  timings,
  onEnsureSceneVoice,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isLoadingVoice, setIsLoadingVoice] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Render static mid-scene thumbnail when not actively previewing
  useEffect(() => {
    if (isPreviewing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sampleTime = scene.startSec + (scene.endSec - scene.startSec) * 0.42;
    renderFrame(ctx, canvas.width, canvas.height, sampleTime, style, allScenes, timings);
  }, [isPreviewing, scene, allScenes, style, timings]);

  const handleTogglePreview = async () => {
    if (isPreviewing) {
      setIsPreviewing(false);
      return;
    }

    // Unlock AudioContext synchronously inside user click gesture
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
    }
    try {
      await audioCtxRef.current.resume();
    } catch {
      // Ignore if resume fails
    }

    const hasAllVoices = scene.lines.every((l) => Boolean(l.audioBase64));
    if (!hasAllVoices) {
      setIsLoadingVoice(true);
      try {
        await onEnsureSceneVoice(scene.sceneNumber);
      } finally {
        setIsLoadingVoice(false);
      }
    }

    setIsPreviewing(true);
  };

  useEffect(() => {
    if (!isPreviewing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let cancelled = false;
    const activeSources: AudioBufferSourceNode[] = [];
    const sceneDuration = scene.endSec - scene.startSec;
    const startPerf = performance.now();

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
    }
    const audioCtx = audioCtxRef.current;
    const sceneTimings = timings.filter((t) => t.sceneNumber === scene.sceneNumber);

    (async () => {
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      for (const t of sceneTimings) {
        if (cancelled || !t.line.audioBase64) continue;
        try {
          const buf = await decodeWavBase64(audioCtx, t.line.audioBase64);
          if (cancelled) return;
          const src = audioCtx.createBufferSource();
          src.buffer = buf;
          const slotDur = Math.max(0.5, t.endSec - t.startSec);
          const rate = buf.duration > slotDur ? Math.min(1.35, buf.duration / slotDur) : 1;
          src.playbackRate.value = rate;
          src.connect(audioCtx.destination);

          const elapsed = (performance.now() - startPerf) / 1000;
          const delay = (t.startSec - scene.startSec) - elapsed;
          if (delay >= 0) {
            src.start(audioCtx.currentTime + delay);
          } else {
            const skip = -delay * rate;
            if (skip < buf.duration) {
              src.start(audioCtx.currentTime, skip);
            }
          }
          activeSources.push(src);
        } catch {
          // Ignore invalid audio buffer
        }
      }
    })();

    const tick = () => {
      if (cancelled) return;
      const elapsed = (performance.now() - startPerf) / 1000;
      const currentSceneTime = scene.startSec + elapsed;
      renderFrame(
        ctx,
        canvas.width,
        canvas.height,
        Math.min(scene.endSec - 0.02, currentSceneTime),
        style,
        allScenes,
        timings
      );

      if (elapsed >= sceneDuration) {
        setIsPreviewing(false);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      for (const s of activeSources) {
        try {
          s.stop();
        } catch {
          // Already stopped
        }
      }
    };
  }, [isPreviewing, scene, allScenes, style, timings]);

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[#231F1E]">
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="block aspect-video w-full"
      />
      <div className="absolute right-2.5 top-2.5">
        <button
          type="button"
          disabled={isLoadingVoice}
          onClick={handleTogglePreview}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/85 disabled:opacity-70 cursor-pointer"
        >
          {isLoadingVoice ? (
            <span>Loading Voice…</span>
          ) : isPreviewing ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>Stop</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>Preview Clip</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
