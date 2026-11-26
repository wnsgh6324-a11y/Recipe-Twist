import React, { useMemo, useState } from "react";
import { Check, Pencil, RefreshCw, Volume2 } from "lucide-react";
import type {
  AnimationStyle,
  DialogueLine,
  ExpressionItem,
  SceneItem,
} from "../types/story";
import type { TimedLine } from "../engine/canvasRenderer";
import { ScenePreviewCanvas } from "./ScenePreviewCanvas";

interface StoryboardSectionProps {
  scenes: SceneItem[];
  expressions: ExpressionItem[];
  style: AnimationStyle;
  timings: TimedLine[];
  regeneratingSceneNum: number | null;
  onUpdateScene: (sceneNumber: 1 | 2 | 3 | 4, patch: Partial<SceneItem>) => void;
  onUpdateLine: (
    sceneNumber: 1 | 2 | 3 | 4,
    lineId: string,
    patch: Partial<DialogueLine>
  ) => void;
  onRegenerateScene: (sceneNumber: 1 | 2 | 3 | 4) => void;
  onEnsureSceneVoice: (sceneNumber: 1 | 2 | 3 | 4) => Promise<SceneItem | undefined>;
}

function renderHighlightedDialogue(
  text: string,
  expressions: ExpressionItem[]
): React.ReactNode {
  const phrases = expressions
    .map((e) => e.phrase.trim())
    .filter((p) => p.length > 0)
    .sort((a, b) => b.length - a.length);

  if (phrases.length === 0) return text;

  const escaped = phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    const isMatch = phrases.some(
      (p) => p.toLowerCase() === part.toLowerCase()
    );
    if (isMatch) {
      return (
        <mark
          key={idx}
          className="rounded bg-[var(--accent-amber-soft)] px-1 py-0.5 font-semibold text-[#7A4E0A] underline decoration-[var(--accent-amber)] decoration-2 underline-offset-4"
        >
          {part}
        </mark>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const StoryboardSection: React.FC<StoryboardSectionProps> = ({
  scenes,
  expressions,
  style,
  timings,
  regeneratingSceneNum,
  onUpdateScene,
  onUpdateLine,
  onRegenerateScene,
  onEnsureSceneVoice,
}) => {
  const [editingSceneNum, setEditingSceneNum] = useState<number | null>(null);

  const totalWords = useMemo(() => {
    return scenes
      .flatMap((s) => s.lines)
      .map((l) => l.text.trim())
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
  }, [scenes]);

  return (
    <section
      id="storyboard"
      className="scroll-mt-20 border-t border-[var(--border-hairline)] py-10 sm:py-14"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--accent-sage)]">
            03. Four-Scene Storyboard
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Scene-by-Scene Script &amp; Subtitles
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)]">
            All five target expressions are highlighted below. Edit any scene or dialogue and click Regenerate Scene to refresh its voices and clip.
          </p>
        </div>

        <p className="font-mono-tabular text-sm font-medium text-[var(--text-secondary)] whitespace-nowrap shrink-0">
          {totalWords} words · Target 60–70 words · 30s
        </p>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {scenes.map((scene) => {
          const isEditing = editingSceneNum === scene.sceneNumber;
          const isRegenerating = regeneratingSceneNum === scene.sceneNumber;
          const hasVoice = scene.lines.every((l) => Boolean(l.audioBase64));

          return (
            <article
              key={scene.id}
              className="flex flex-col justify-between rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono-tabular text-xs font-semibold text-[var(--text-muted)]">
                    <span>Scene {scene.sceneNumber}</span>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span>
                      {scene.startSec}–{scene.endSec}s
                    </span>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[var(--accent-coral)]">{scene.label}</span>
                  </p>

                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)]">
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{hasVoice ? "Voice Ready" : "Visual Preview"}</span>
                  </span>
                </div>

                <h3 className="mt-1.5 font-display text-xl font-bold text-[var(--text-primary)]">
                  {scene.title}
                </h3>

                <div className="mt-4">
                  <ScenePreviewCanvas
                    scene={scene}
                    allScenes={scenes}
                    style={style}
                    timings={timings}
                    onEnsureSceneVoice={onEnsureSceneVoice}
                  />
                </div>

                {isEditing ? (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">
                        Scene Description
                      </label>
                      <textarea
                        rows={2}
                        value={scene.description}
                        onChange={(e) =>
                          onUpdateScene(scene.sceneNumber, {
                            description: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />
                    </div>

                    {scene.lines.map((line) => (
                      <div
                        key={line.id}
                        className="space-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
                      >
                        <div className="text-xs font-bold text-[var(--text-primary)]">
                          {line.speaker}
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--text-muted)]">
                            English Dialogue
                          </label>
                          <input
                            type="text"
                            value={line.text}
                            onChange={(e) =>
                              onUpdateLine(scene.sceneNumber, line.id, {
                                text: e.target.value,
                                audioBase64: undefined,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--text-muted)]">
                            Korean Subtitle (한국어 자막)
                          </label>
                          <input
                            type="text"
                            value={line.koreanText}
                            onChange={(e) =>
                              onUpdateLine(scene.sceneNumber, line.id, {
                                koreanText: e.target.value,
                              })
                            }
                            className="font-korean mt-1 w-full rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {scene.description}
                    </p>

                    <div className="mt-4 space-y-3 border-t border-[var(--border-hairline)] pt-4">
                      {scene.lines.map((line) => (
                        <div key={line.id} className="space-y-1">
                          <p className="text-base leading-relaxed text-[var(--text-primary)]">
                            <span className="font-bold text-[var(--text-primary)]">
                              {line.speaker}:
                            </span>{" "}
                            “{renderHighlightedDialogue(line.text, expressions)}”
                          </p>
                          <p className="font-korean text-sm leading-relaxed text-[var(--text-secondary)]">
                            {line.koreanText}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-[var(--border-hairline)] pt-4">
                <button
                  type="button"
                  onClick={() =>
                    setEditingSceneNum(isEditing ? null : scene.sceneNumber)
                  }
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  {isEditing ? (
                    <>
                      <Check className="h-4 w-4 text-[var(--accent-sage)]" aria-hidden="true" />
                      <span>Save Edits</span>
                    </>
                  ) : (
                    <>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      <span>Edit Scene</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isRegenerating}
                  onClick={() => onRegenerateScene(scene.sceneNumber)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--accent-sage-soft)] px-4 py-2 text-sm font-semibold text-[var(--accent-sage)] transition-colors hover:bg-[#dce9e2] disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span>
                    {isRegenerating ? "Regenerating..." : "Regenerate Scene"}
                  </span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
