import React, { useEffect, useRef, useState } from "react";
import {
  Download,
  Film,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { AnimationStyle, SceneItem } from "../types/story";
import { ANIMATION_STYLES, STORY_TITLE } from "../data/defaultStory";
import { renderFrame, type TimedLine } from "../engine/canvasRenderer";
import { decodeWavBase64, exportCompositeVideo } from "../engine/videoComposer";

interface VideoStudioSectionProps {
  style: AnimationStyle;
  onSelectStyle: (style: AnimationStyle) => void;
  scenes: SceneItem[];
  timings: TimedLine[];
  isGeneratingAll: boolean;
  generationProgress: string | null;
  onGenerateAllClips: () => Promise<boolean>;
}

function formatTimecode(sec: number): string {
  const clamped = Math.max(0, Math.min(30, Math.floor(sec)));
  const s = String(clamped).padStart(2, "0");
  return `00:${s}`;
}

export const VideoStudioSection: React.FC<VideoStudioSectionProps> = ({
  style,
  onSelectStyle,
  scenes,
  timings,
  isGeneratingAll,
  generationProgress,
  onGenerateAllClips,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showKoreanStudy, setShowKoreanStudy] = useState(true);

  const [isExporting, setIsExporting] = useState(false);
  const [exportSec, setExportSec] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedVideo, setExportedVideo] = useState<{
    url: string;
    extension: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const playOffsetRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const voicesReadyCount = scenes.filter((s) =>
    s.lines.every((l) => Boolean(l.audioBase64))
  ).length;

  const ensureUnlockedAudioContext = async (): Promise<AudioContext> => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
      const gain = audioCtxRef.current.createGain();
      gain.gain.value = isMuted ? 0 : 1;
      gain.connect(audioCtxRef.current.destination);
      gainNodeRef.current = gain;
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : 1;
    }
  }, [isMuted]);

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Clear cached export when scenes or style change
  useEffect(() => {
    setExportedVideo((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, [style, scenes]);

  // Paint current frame when paused
  useEffect(() => {
    if (isPlaying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderFrame(ctx, canvas.width, canvas.height, currentTime, style, scenes, timings);
  }, [currentTime, isPlaying, style, scenes, timings]);

  // Synchronized 30s playback loop (Canvas + WebAudio English voices)
  useEffect(() => {
    if (!isPlaying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    let rafId = 0;
    const activeSources: AudioBufferSourceNode[] = [];
    const startOffset = playOffsetRef.current >= 29.8 ? 0 : playOffsetRef.current;
    const startPerf = performance.now();

    (async () => {
      const audioCtx = await ensureUnlockedAudioContext();
      const targetNode = gainNodeRef.current ?? audioCtx.destination;

      for (const timing of timings) {
        if (cancelled) return;
        if (timing.endSec <= startOffset + 0.05) continue;
        if (!timing.line.audioBase64) continue;

        try {
          const buffer = await decodeWavBase64(audioCtx, timing.line.audioBase64);
          if (cancelled) return;
          const src = audioCtx.createBufferSource();
          src.buffer = buffer;

          const slotDuration = Math.max(0.5, timing.endSec - timing.startSec);
          const rate =
            buffer.duration > slotDuration
              ? Math.min(1.35, buffer.duration / slotDuration)
              : 1;
          src.playbackRate.value = rate;
          src.connect(targetNode);

          const currentPlayhead = startOffset + (performance.now() - startPerf) / 1000;
          const delay = timing.startSec - currentPlayhead;
          if (delay >= 0) {
            src.start(audioCtx.currentTime + delay);
          } else {
            const skipSec = -delay * rate;
            if (skipSec < buffer.duration) {
              src.start(audioCtx.currentTime, skipSec);
            }
          }
          activeSources.push(src);
        } catch {
          // Ignore unreadable audio buffer
        }
      }
    })();

    const tick = () => {
      if (cancelled) return;
      const elapsed = (performance.now() - startPerf) / 1000;
      const nextTime = Math.min(30, startOffset + elapsed);
      playOffsetRef.current = nextTime;
      setCurrentTime(nextTime);
      renderFrame(ctx, canvas.width, canvas.height, nextTime, style, scenes, timings);

      if (nextTime >= 30) {
        setIsPlaying(false);
        playOffsetRef.current = 0;
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
  }, [isPlaying, style, scenes, timings]);

  const handleTogglePlay = async () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    // Unlock AudioContext immediately inside user click event
    await ensureUnlockedAudioContext();

    // Auto-generate voices first if any scene doesn't have voice audio yet
    if (voicesReadyCount < 4) {
      const ok = await onGenerateAllClips();
      if (!ok) return;
    }

    if (currentTime >= 29.8) {
      playOffsetRef.current = 0;
      setCurrentTime(0);
    } else {
      playOffsetRef.current = currentTime;
    }
    setIsPlaying(true);
  };

  const handleSeek = async (sec: number) => {
    const clamped = Math.max(0, Math.min(30, sec));
    playOffsetRef.current = clamped;
    setCurrentTime(clamped);
    if (isPlaying) {
      await ensureUnlockedAudioContext();
      setIsPlaying(false);
      setTimeout(() => setIsPlaying(true), 20);
    }
  };

  const triggerDownload = (url: string, extension: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `Recipe-Twist-30s-${style}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportAndDownload = async () => {
    if (exportedVideo) {
      triggerDownload(exportedVideo.url, exportedVideo.extension);
      return;
    }

    setIsPlaying(false);
    setExportError(null);

    if (voicesReadyCount < 4) {
      const ok = await onGenerateAllClips();
      if (!ok) return;
    }

    setIsExporting(true);
    setExportSec(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { blob, extension } = await exportCompositeVideo({
        style,
        scenes,
        timings,
        signal: controller.signal,
        onProgress: (elapsed) => setExportSec(elapsed),
      });
      const url = URL.createObjectURL(blob);
      setExportedVideo({ url, extension });
      triggerDownload(url, extension);
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        setExportError(
          err instanceof Error ? err.message : "Could not export video."
        );
      }
    } finally {
      setIsExporting(false);
      abortRef.current = null;
    }
  };

  const activeScene =
    scenes.find((s) => currentTime >= s.startSec && currentTime < s.endSec) ??
    scenes[scenes.length - 1];
  const activeTiming = timings.find(
    (t) => currentTime >= t.startSec && currentTime <= t.endSec
  );

  return (
    <section
      id="studio"
      className="scroll-mt-20 border-t border-[var(--border-hairline)] py-10 sm:py-14"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--accent-coral)]">
            04. Animation &amp; Final 30s Video
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Choose Style &amp; Combine Four Clips
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)]">
            Pick 2D, 3D, Clay, or Watercolor animation, generate natural English voices for all four scenes, and download your 30-second video.
          </p>
        </div>

        <button
          type="button"
          disabled={isGeneratingAll}
          onClick={() => {
            ensureUnlockedAudioContext().catch(() => {});
            onGenerateAllClips();
          }}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--accent-coral)] px-5 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[var(--accent-coral-hover)] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Film className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            {isGeneratingAll
              ? generationProgress || "Generating…"
              : voicesReadyCount === 4
                ? "Regenerate All 4 Clips & Voices"
                : "Generate 4 Clips & Voices"}
          </span>
        </button>
      </div>

      {/* Style selector grid */}
      <div
        role="radiogroup"
        aria-label="Animation style"
        className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {ANIMATION_STYLES.map((opt) => {
          const selected = style === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelectStyle(opt.id)}
              className={`group flex flex-col overflow-hidden rounded-2xl border text-left transition-all cursor-pointer min-h-[48px] ${
                selected
                  ? "border-[var(--accent-coral)] bg-[var(--bg-surface)] ring-2 ring-[var(--accent-coral)]/25"
                  : "border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[#cbbfae]"
              }`}
            >
              <div className="relative aspect-video w-full overflow-hidden bg-[var(--bg-subtle)]">
                <img
                  src={opt.backdropUrl}
                  alt={`${opt.name} animation studio backdrop`}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-bold text-[var(--text-primary)] sm:text-lg">
                    {opt.name}
                  </span>
                  <span className="font-korean text-xs font-medium text-[var(--text-muted)]">
                    {opt.koreanLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)] sm:text-sm">
                  {opt.shortDesc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Final Screen Video Player */}
      <div className="mt-8 rounded-3xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-6">
        <div className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono-tabular text-xs font-medium text-[var(--text-muted)]">
              <span>{STORY_TITLE}</span>
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              <span>
                Scene {activeScene.sceneNumber}: {activeScene.label}
              </span>
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              <span>
                {voicesReadyCount}/4 voiced clips combined
              </span>
            </p>
          </div>

          <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showKoreanStudy}
              onChange={(e) => setShowKoreanStudy(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent-sage)]"
            />
            <span className="font-korean">Korean Study Subtitles (한국어 공부 자막)</span>
          </label>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-[#1F1B18]">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="block aspect-video w-full"
          />
        </div>

        {showKoreanStudy && (
          <div className="mt-3 rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-center">
            <p className="font-korean text-base font-medium text-[var(--text-primary)]">
              {activeTiming
                ? `${activeTiming.line.speaker}: ${activeTiming.line.koreanText}`
                : "재생을 눌러 30초 애니메이션과 영어 음성을 확인해 보세요."}
            </p>
          </div>
        )}

        {/* Scrubber & Scene Markers */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="font-mono-tabular text-sm font-semibold text-[var(--text-primary)] shrink-0">
              {formatTimecode(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={30}
              step={0.1}
              value={currentTime}
              aria-label="Video timeline scrubber"
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="h-2.5 w-full cursor-pointer accent-[var(--accent-coral)]"
            />
            <span className="font-mono-tabular text-sm font-medium text-[var(--text-muted)] shrink-0">
              00:30
            </span>
          </div>

          {/* Scene Jump Chips */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {scenes.map((scene) => {
              const isCurrent = activeScene.sceneNumber === scene.sceneNumber;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => handleSeek(scene.startSec)}
                  className={`flex min-h-[44px] items-center justify-between rounded-xl px-3.5 py-2 text-left text-xs font-semibold transition-colors cursor-pointer sm:text-sm ${
                    isCurrent
                      ? "bg-[var(--text-primary)] text-white"
                      : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span className="truncate">
                    {scene.sceneNumber}. {scene.label}
                  </span>
                  <span className="font-mono-tabular ml-2 shrink-0 opacity-80">
                    {scene.startSec}–{scene.endSec}s
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Playback & Download Controls */}
        <div className="mt-5 flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={isGeneratingAll}
              onClick={handleTogglePlay}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 py-2.5 text-base font-semibold text-white transition-colors hover:bg-[#313834] disabled:opacity-60 cursor-pointer"
            >
              {isGeneratingAll ? (
                <span>{generationProgress || "Loading Voices…"}</span>
              ) : isPlaying ? (
                <>
                  <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 fill-current" aria-hidden="true" />
                  <span>Play 30s Video</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSeek(0)}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Restart</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              aria-label={isMuted ? "Unmute voices" : "Mute voices"}
              className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="h-5 w-5 text-[var(--accent-coral)]" aria-hidden="true" />
              ) : (
                <Volume2 className="h-5 w-5 text-[var(--accent-sage)]" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isExporting ? (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-2 min-h-[48px]">
                <span className="font-mono-tabular text-sm font-semibold text-[var(--text-primary)]">
                  Exporting {Math.round(exportSec)}s / 30s…
                </span>
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Cancel video export"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/10 cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isGeneratingAll}
                onClick={handleExportAndDownload}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-sage)] px-5 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#3d6555] disabled:opacity-60 sm:w-auto cursor-pointer"
              >
                <Download className="h-5 w-5" aria-hidden="true" />
                <span>
                  {exportedVideo ? "Download Video Again" : "Download Video"}
                </span>
              </button>
            )}
          </div>
        </div>

        {exportError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {exportError}
          </div>
        )}

        {/* Final Screen Required Attribution */}
        <div className="mt-6 border-t border-[var(--border-hairline)] pt-4 text-center">
          <p className="text-sm font-medium text-[var(--text-muted)]">
            Made with Google AI Studio · Script by Student Creator
          </p>
        </div>
      </div>
    </section>
  );
};
