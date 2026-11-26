import React, { useState } from "react";
import { Check, Pencil, RotateCcw, Languages } from "lucide-react";
import type { ExpressionItem } from "../types/story";

interface ExpressionsSectionProps {
  expressions: ExpressionItem[];
  onUpdateExpression: (id: string, patch: Partial<ExpressionItem>) => void;
  onResetExpressions: () => void;
}

export const ExpressionsSection: React.FC<ExpressionsSectionProps> = ({
  expressions,
  onUpdateExpression,
  onResetExpressions,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAutoTranslate = async (item: ExpressionItem) => {
    setTranslatingId(item.id);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/expressions/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phrase: item.phrase,
          sourceMovie: item.sourceMovie,
        }),
      });
      const data = (await res.json()) as {
        koreanMeaning?: string;
        nuanceNote?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Unable to update Korean meaning.");
      }
      onUpdateExpression(item.id, {
        koreanMeaning: data.koreanMeaning || item.koreanMeaning,
        nuanceNote: data.nuanceNote || item.nuanceNote,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Translation failed.");
    } finally {
      setTranslatingId(null);
    }
  };

  return (
    <section id="expressions" className="scroll-mt-20 py-10 sm:py-14">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--accent-sage)]">
            01. Key Expressions
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Five Movie Expressions to Learn
          </h2>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)]">
            Tap any card to customize the English phrase, Korean meaning, or movie source before building your video.
          </p>
        </div>

        <button
          type="button"
          onClick={onResetExpressions}
          className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>Reset Expressions</span>
        </button>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {errorMsg}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {expressions.map((item) => {
          const isEditing = editingId === item.id;
          const isBusy = translatingId === item.id;

          return (
            <article
              key={item.id}
              className="flex flex-col justify-between rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-[var(--text-muted)] font-mono-tabular">
                    <span>0{item.index}</span>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span>{item.sourceMovie}</span>
                  </p>

                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : item.id)}
                    aria-label={isEditing ? `Done editing expression ${item.index}` : `Edit expression ${item.index}`}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    {isEditing ? (
                      <Check className="h-4 w-4 text-[var(--accent-sage)]" aria-hidden="true" />
                    ) : (
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>

                {isEditing ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">
                        English Expression
                      </label>
                      <input
                        type="text"
                        value={item.phrase}
                        onChange={(e) =>
                          onUpdateExpression(item.id, { phrase: e.target.value })
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2.5 text-base font-semibold text-[var(--text-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">
                        Korean Meaning (한국어 뜻)
                      </label>
                      <textarea
                        rows={2}
                        value={item.koreanMeaning}
                        onChange={(e) =>
                          onUpdateExpression(item.id, { koreanMeaning: e.target.value })
                        }
                        className="font-korean mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">
                        Movie Source
                      </label>
                      <input
                        type="text"
                        value={item.sourceMovie}
                        onChange={(e) =>
                          onUpdateExpression(item.id, { sourceMovie: e.target.value })
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleAutoTranslate(item)}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[#e8e1d6] disabled:opacity-60 cursor-pointer"
                      >
                        <Languages className="h-4 w-4 text-[var(--accent-sage)]" aria-hidden="true" />
                        <span>{isBusy ? "Updating..." : "Refresh Korean Meaning"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex min-h-[44px] items-center rounded-xl bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="mt-2 font-display text-xl font-bold leading-snug text-[var(--text-primary)]">
                      “{item.phrase}”
                    </h3>
                    <p className="font-korean mt-2.5 text-base font-medium leading-relaxed text-[var(--accent-sage)]">
                      {item.koreanMeaning}
                    </p>
                    <p className="mt-2.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {item.nuanceNote}
                    </p>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
