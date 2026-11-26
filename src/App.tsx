import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Clapperboard, Film, Layers } from "lucide-react";
import {
  DEFAULT_EXPRESSIONS,
  DEFAULT_SCENES,
  STORY_TITLE,
} from "./data/defaultStory";
import type {
  AnimationStyle,
  DialogueLine,
  ExpressionItem,
  SceneItem,
} from "./types/story";
import { preloadStyleBackdrops } from "./engine/canvasRenderer";
import {
  buildCompositeVideo,
  computeSceneTimings,
  measureBase64Duration,
  type GeneratedVideoArtifact,
} from "./engine/videoComposer";
import { TopBar } from "./components/TopBar";
import { ExpressionsSection } from "./components/ExpressionsSection";
import { StorySection } from "./components/StorySection";
import { StoryboardSection } from "./components/StoryboardSection";
import { VideoStudioSection } from "./components/VideoStudioSection";

export default function App() {
  const [expressions, setExpressions] =
    useState<ExpressionItem[]>(DEFAULT_EXPRESSIONS);
  const [scenes, setScenes] = useState<SceneItem[]>(DEFAULT_SCENES);
  const [style, setStyle] = useState<AnimationStyle>("2d");
  const [generatedVideo, setGeneratedVideo] =
    useState<GeneratedVideoArtifact | null>(null);

  const [regeneratingSceneNum, setRegeneratingSceneNum] = useState<
    number | null
  >(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string | null>(
    null
  );
  const [apiError, setApiError] = useState<string | null>(null);

  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const styleRef = useRef(style);
  styleRef.current = style;

  useEffect(() => {
    preloadStyleBackdrops();
  }, []);

  useEffect(() => {
    return () => {
      if (generatedVideo?.url) {
        URL.revokeObjectURL(generatedVideo.url);
      }
    };
  }, [generatedVideo]);

  const invalidateGeneratedVideo = useCallback(() => {
    setGeneratedVideo((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const timings = useMemo(() => computeSceneTimings(scenes), [scenes]);

  const fetchVoiceForScene = useCallback(
    async (scene: SceneItem, targetStyle: AnimationStyle): Promise<SceneItem> => {
      const res = await fetch("/api/tts/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: scene.lines.map((l) => ({
            id: l.id,
            speaker: l.speaker,
            text: l.text,
            styleHint: l.styleHint,
          })),
        }),
      });

      const data = (await res.json()) as {
        audioLines?: Array<{ id: string; audioBase64: string }>;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(
          data.error || `Failed generating voices for Scene ${scene.sceneNumber}.`
        );
      }

      const enrichedLines: DialogueLine[] = [];
      for (const line of scene.lines) {
        const match = data.audioLines?.find((a) => a.id === line.id);
        let dur = line.audioDurationSec;
        if (match?.audioBase64) {
          try {
            dur = await measureBase64Duration(match.audioBase64);
          } catch {
            // Keep estimated duration
          }
        }
        enrichedLines.push({
          ...line,
          audioBase64: match?.audioBase64 ?? line.audioBase64,
          audioDurationSec: dur,
        });
      }

      return {
        ...scene,
        lines: enrichedLines,
        clipReady: true,
        generatedStyle: targetStyle,
      };
    },
    []
  );

  const handleEnsureSceneVoice = useCallback(
    async (sceneNumber: 1 | 2 | 3 | 4): Promise<SceneItem | undefined> => {
      const target = scenesRef.current.find(
        (s) => s.sceneNumber === sceneNumber
      );
      if (!target) return undefined;
      if (target.lines.every((l) => Boolean(l.audioBase64))) {
        return target;
      }

      setApiError(null);
      try {
        const updated = await fetchVoiceForScene(target, styleRef.current);
        setScenes((prev) =>
          prev.map((s) => (s.sceneNumber === sceneNumber ? updated : s))
        );
        return updated;
      } catch (err: unknown) {
        setApiError(
          err instanceof Error
            ? err.message
            : "Failed to synthesize scene voice."
        );
        return undefined;
      }
    },
    [fetchVoiceForScene]
  );

  const handleGenerateAllClips = useCallback(async (): Promise<GeneratedVideoArtifact | null> => {
    setApiError(null);
    setIsGeneratingAll(true);

    try {
      const targetStyle = styleRef.current;
      const workingScenes: SceneItem[] = [...scenesRef.current];

      for (let i = 0; i < workingScenes.length; i++) {
        const latestScene = scenesRef.current[i];
        const hasAllLineAudio = latestScene.lines.every((l) =>
          Boolean(l.audioBase64)
        );

        if (hasAllLineAudio) {
          workingScenes[i] = {
            ...latestScene,
            clipReady: true,
            generatedStyle: targetStyle,
          };
          continue;
        }

        setGenerationProgress(
          `Generating voice ${latestScene.sceneNumber}/4 (${latestScene.startSec}–${latestScene.endSec}s)…`
        );

        const updatedScene = await fetchVoiceForScene(latestScene, targetStyle);
        workingScenes[i] = updatedScene;
        setScenes((prev) =>
          prev.map((s) =>
            s.sceneNumber === updatedScene.sceneNumber ? updatedScene : s
          )
        );
      }

      const finalTimings = computeSceneTimings(workingScenes);
      setGenerationProgress("Rendering 30s video… 0%");

      const artifact = await buildCompositeVideo({
        style: targetStyle,
        scenes: workingScenes,
        timings: finalTimings,
        onProgress: (percent) =>
          setGenerationProgress(`Rendering 30s video… ${percent}%`),
      });

      setGeneratedVideo((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return artifact;
      });
      return artifact;
    } catch (err: unknown) {
      setApiError(
        err instanceof Error ? err.message : "Failed to generate 30s video."
      );
      return null;
    } finally {
      setIsGeneratingAll(false);
      setGenerationProgress(null);
    }
  }, [fetchVoiceForScene]);

  const handleSelectStyle = (nextStyle: AnimationStyle) => {
    if (nextStyle === style) return;
    setStyle(nextStyle);
    invalidateGeneratedVideo();
  };

  const handleUpdateExpression = (
    id: string,
    patch: Partial<ExpressionItem>
  ) => {
    setExpressions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleResetExpressions = () => {
    setExpressions(DEFAULT_EXPRESSIONS);
  };

  const handleUpdateScene = (
    sceneNumber: 1 | 2 | 3 | 4,
    patch: Partial<SceneItem>
  ) => {
    invalidateGeneratedVideo();
    setScenes((prev) =>
      prev.map((s) => (s.sceneNumber === sceneNumber ? { ...s, ...patch } : s))
    );
  };

  const handleUpdateLine = (
    sceneNumber: 1 | 2 | 3 | 4,
    lineId: string,
    patch: Partial<DialogueLine>
  ) => {
    invalidateGeneratedVideo();
    setScenes((prev) =>
      prev.map((s) =>
        s.sceneNumber === sceneNumber
          ? {
              ...s,
              clipReady: false,
              lines: s.lines.map((l) =>
                l.id === lineId ? { ...l, ...patch } : l
              ),
            }
          : s
      )
    );
  };

  const handleRegenerateScene = async (sceneNumber: 1 | 2 | 3 | 4) => {
    const target = scenes.find((s) => s.sceneNumber === sceneNumber);
    if (!target) return;

    setApiError(null);
    setRegeneratingSceneNum(sceneNumber);
    invalidateGeneratedVideo();

    try {
      const res = await fetch("/api/scene/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneNumber: target.sceneNumber,
          label: target.label,
          description: target.description,
          lines: target.lines,
          expressions,
        }),
      });

      const data = (await res.json()) as {
        description?: string;
        lines?: Array<{
          id: string;
          speaker: "Mia" | "Alex" | "Judge";
          text: string;
          koreanText: string;
          expressionId?: string;
        }>;
        audioLines?: Array<{ id: string; audioBase64: string }>;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || "Scene regeneration failed.");
      }

      const durations = new Map<string, number>();
      for (const audio of data.audioLines ?? []) {
        try {
          const dur = await measureBase64Duration(audio.audioBase64);
          durations.set(audio.id, dur);
        } catch {
          // Fallback to estimated duration
        }
      }

      setScenes((prev) =>
        prev.map((s) => {
          if (s.sceneNumber !== sceneNumber) return s;
          const updatedLines = (data.lines ?? s.lines).map((nl) => {
            const audioMatch = data.audioLines?.find((a) => a.id === nl.id);
            const origLine = s.lines.find((ol) => ol.id === nl.id);
            return {
              ...origLine,
              ...nl,
              audioBase64: audioMatch?.audioBase64 ?? origLine?.audioBase64,
              audioDurationSec:
                durations.get(nl.id) ?? origLine?.audioDurationSec,
            };
          });

          return {
            ...s,
            description: data.description || s.description,
            lines: updatedLines,
            clipReady: true,
            generatedStyle: style,
          };
        })
      );
    } catch (err: unknown) {
      setApiError(
        err instanceof Error ? err.message : "Failed to regenerate scene."
      );
    } finally {
      setRegeneratingSceneNum(null);
    }
  };

  const jumpToStudio = () => {
    document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div id="top" className="min-h-screen pb-20 md:pb-8">
      <TopBar onJumpToVideo={jumpToStudio} />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="py-10 sm:py-14">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-[var(--accent-sage)]">
              English Learning Video Studio · Korean University Edition
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl text-balance">
              Turn Five Movie Expressions Into a 30-Second Animated Story
            </h1>
            <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
              Follow <strong className="font-semibold text-[var(--text-primary)]">{STORY_TITLE}</strong>, customize expressions and Korean subtitles, choose 2D, 3D, Clay, or Watercolor animation, and export one voiced 30-second video.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  jumpToStudio();
                  void handleGenerateAllClips();
                }}
                disabled={isGeneratingAll}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[var(--accent-coral)] px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[var(--accent-coral-hover)] disabled:opacity-60 cursor-pointer"
              >
                <Film className="h-5 w-5" aria-hidden="true" />
                <span>
                  {isGeneratingAll
                    ? generationProgress || "Generating…"
                    : "Generate 30s Video with Voices"}
                </span>
              </button>

              <a
                href="#storyboard"
                className="inline-flex min-h-[48px] items-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 py-3 text-base font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
              >
                Review 4 Scenes
              </a>
            </div>
          </div>

          {apiError && (
            <div
              role="alert"
              className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800"
            >
              {apiError}
            </div>
          )}
        </section>

        <ExpressionsSection
          expressions={expressions}
          onUpdateExpression={handleUpdateExpression}
          onResetExpressions={handleResetExpressions}
        />

        <StorySection />

        <StoryboardSection
          scenes={scenes}
          expressions={expressions}
          style={style}
          timings={timings}
          regeneratingSceneNum={regeneratingSceneNum}
          onUpdateScene={handleUpdateScene}
          onUpdateLine={handleUpdateLine}
          onRegenerateScene={handleRegenerateScene}
          onEnsureSceneVoice={handleEnsureSceneVoice}
        />

        <VideoStudioSection
          style={style}
          onSelectStyle={handleSelectStyle}
          scenes={scenes}
          timings={timings}
          generatedVideo={generatedVideo}
          isGeneratingAll={isGeneratingAll}
          generationProgress={generationProgress}
          generationError={apiError}
          onGenerateAllClips={handleGenerateAllClips}
        />
      </main>

      {/* Mobile Sticky Bottom Navigation (within 15% mobile sticky cap) */}
      <nav
        aria-label="Mobile sections"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-16 grid-cols-4 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 backdrop-blur-md md:hidden"
      >
        <a
          href="#expressions"
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent-coral)]"
        >
          <BookOpen className="h-5 w-5" aria-hidden="true" />
          <span>Expressions</span>
        </a>
        <a
          href="#story"
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent-coral)]"
        >
          <Layers className="h-5 w-5" aria-hidden="true" />
          <span>Story</span>
        </a>
        <a
          href="#storyboard"
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent-coral)]"
        >
          <Clapperboard className="h-5 w-5" aria-hidden="true" />
          <span>Scenes</span>
        </a>
        <a
          href="#studio"
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--accent-coral)]"
        >
          <Film className="h-5 w-5" aria-hidden="true" />
          <span>Video</span>
        </a>
      </nav>
    </div>
  );
}
