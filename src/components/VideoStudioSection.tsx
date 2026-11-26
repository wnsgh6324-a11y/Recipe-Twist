import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Download,
  Film,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { AnimationStyle, SceneItem } from "../types/story";
import { ANIMATION_STYLES, STORY_TITLE } from "../data/defaultStory";
import { renderFrame, type TimedLine } from "../engine/canvasRenderer";
import type { GeneratedVideoArtifact } from "../engine/videoComposer";

interface VideoStudioSectionProps {
  style: AnimationStyle;
  onSelectStyle: (style: AnimationStyle) => void;
  scenes: SceneItem[];
  timings: TimedLine[];
  generatedVideo: GeneratedVideoArtifact | null;
  isGeneratingAll: boolean;
  generationProgress: string | null;
  generationError: string | null;
  onGenerateAllClips: () => Promise<GeneratedVideoArtifact | null>;
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
  generatedVideo,
  isGeneratingAll,
  generationProgress,
  generationError,
  onGenerateAllClips,
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingAutoPlayRef = useRef(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showKoreanStudy, setShowKoreanStudy] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const voicesReadyCount = scenes.filter((s) =>
    s.lines.every((l) => Boolean(l.audioBase64))
  ).length;

  // Reset player position when video artifact changes or is cleared
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (generatedVideo) {
      setPlayerError(null);
    }
  }, [generatedVideo]);

  // Paint preview canvas frame when no generated video exists yet
  useEffect(() => {
    if (generatedVideo) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderFrame(ctx, canvas.width, canvas.height, currentTime, style, scenes, timings);
  }, [generatedVideo, currentTime, style, scenes, timings]);

  // Sync mute state with <video> element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const attemptVideoPlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    setPlayerError(null);
    try {
      video.muted = isMuted;
      if (video.currentTime >= 29.8) {
        video.currentTime = 0;
        setCurrentTime(0);
      }
      await video.play();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "브라우저에서 영상 재생을 시작하지 못했습니다.";
      setPlayerError(
        `영상을 재생할 수 없습니다: ${msg}. 재생 버튼을 다시 눌러 주세요.`
      );
      setIsPlaying(false);
    }
  };

  const handleTogglePlay = async () => {
    if (!generatedVideo?.url) {
      setPlayerError(
        "재생할 영상 파일이 아직 생성되지 않았습니다. 먼저 'Generate 4 Clips & Voices' 버튼을 눌러 30초 영상을 생성해 주세요."
      );
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setPlayerError("비디오 플레이어를 초기화하지 못했습니다. 페이지를 새로고침해 주세요.");
      return;
    }

    if (!video.paused && !video.ended) {
      video.pause();
      return;
    }

    await attemptVideoPlay();
  };

  const handleGenerateAndPlay = async () => {
    setPlayerError(null);
    pendingAutoPlayRef.current = true;
    const artifact = await onGenerateAllClips();
    if (!artifact) {
      pendingAutoPlayRef.current = false;
    }
  };

  const handleVideoCanPlay = () => {
    if (pendingAutoPlayRef.current) {
      pendingAutoPlayRef.current = false;
      void attemptVideoPlay();
    }
  };

  const handleSeek = (sec: number) => {
    const clamped = Math.max(0, Math.min(30, sec));
    setCurrentTime(clamped);
    if (videoRef.current && generatedVideo?.url) {
      videoRef.current.currentTime = clamped;
    }
  };

  const triggerDownload = (artifact: GeneratedVideoArtifact) => {
    const a = document.createElement("a");
    a.href = artifact.url;
    a.download = `Recipe-Twist-30s-${artifact.style}.${artifact.extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownload = async () => {
    setPlayerError(null);
    if (generatedVideo) {
      triggerDownload(generatedVideo);
      return;
    }

    const artifact = await onGenerateAllClips();
    if (artifact) {
      triggerDownload(artifact);
    }
  };

  const activeScene =
    scenes.find((s) => currentTime >= s.startSec && currentTime < s.endSec) ??
    scenes[scenes.length - 1];
  const activeTiming = timings.find(
    (t) => currentTime >= t.startSec && currentTime <= t.endSec
  );

  const visibleError = playerError || generationError;

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
            setPlayerError(null);
            void onGenerateAllClips();
          }}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--accent-coral)] px-5 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[var(--accent-coral-hover)] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Film className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            {isGeneratingAll
              ? generationProgress || "Generating…"
              : generatedVideo
                ? "Regenerate 30s Video"
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
                {generatedVideo
                  ? `Ready (${generatedVideo.extension.toUpperCase()} · ${(generatedVideo.sizeBytes / (1024 * 1024)).toFixed(1)} MB)`
                  : voicesReadyCount > 0
                    ? `${voicesReadyCount}/4 voices ready · Video not built`
                    : "Video not generated yet"}
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

        {/* Video Stage: renders real <video> when generated, or preview canvas when not yet generated */}
        <div className="relative overflow-hidden rounded-2xl bg-[#1F1B18]">
          {generatedVideo?.url ? (
            <video
              ref={videoRef}
              src={generatedVideo.url}
              playsInline
              preload="auto"
              onCanPlay={handleVideoCanPlay}
              onTimeUpdate={() => {
                if (videoRef.current) {
                  setCurrentTime(videoRef.current.currentTime);
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                setCurrentTime(30);
              }}
              onError={() => {
                setIsPlaying(false);
                setPlayerError(
                  "생성된 영상 파일을 디코딩하지 못했습니다. 'Regenerate 30s Video' 버튼을 눌러 다시 생성해 주세요."
                );
              }}
              className="block aspect-video w-full bg-[#1F1B18]"
            />
          ) : (
            <div className="relative">
              <canvas
                ref={previewCanvasRef}
                width={1280}
                height={720}
                className="block aspect-video w-full opacity-90"
              />
              <div className="absolute inset-x-0 top-4 flex justify-center px-4">
                <p className="rounded-xl bg-black/75 px-4 py-2 text-center text-xs font-medium text-white backdrop-blur-sm sm:text-sm">
                  {isGeneratingAll
                    ? generationProgress || "30초 영상과 영어 음성을 생성하고 있습니다…"
                    : "아직 30초 영상이 생성되지 않았습니다. 'Generate 4 Clips & Voices'를 눌러 영상을 만들어 주세요."}
                </p>
              </div>
            </div>
          )}
        </div>

        {visibleError && (
          <div
            role="alert"
            className="mt-4 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
              <span className="font-korean leading-relaxed">{visibleError}</span>
            </div>

            {!generatedVideo?.url && !isGeneratingAll && (
              <button
                type="button"
                onClick={handleGenerateAndPlay}
                className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-coral)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-coral-hover)] cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                <span>Generate &amp; Play Now</span>
              </button>
            )}
          </div>
        )}

        {showKoreanStudy && (
          <div className="mt-3 rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-center">
            <p className="font-korean text-base font-medium text-[var(--text-primary)]">
              {activeTiming
                ? `${activeTiming.line.speaker}: ${activeTiming.line.koreanText}`
                : "영상을 생성하고 재생하면 장면에 맞는 한국어 자막이 함께 표시됩니다."}
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
                <span>{generationProgress || "Generating Video…"}</span>
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
            <button
              type="button"
              disabled={isGeneratingAll}
              onClick={handleDownload}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-sage)] px-5 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#3d6555] disabled:opacity-60 sm:w-auto cursor-pointer"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
              <span>
                {generatedVideo ? "Download Video" : "Generate & Download Video"}
              </span>
            </button>
          </div>
        </div>

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
