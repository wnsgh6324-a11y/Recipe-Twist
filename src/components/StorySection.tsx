import React from "react";
import { CHARACTER_BIBLE, STORY_SUMMARY, STORY_TITLE } from "../data/defaultStory";

export const StorySection: React.FC = () => {
  return (
    <section
      id="story"
      className="scroll-mt-20 border-t border-[var(--border-hairline)] py-10 sm:py-14"
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <p className="text-sm font-medium text-[var(--accent-coral)]">
            02. Original Story
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            {STORY_TITLE}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            {STORY_SUMMARY}
          </p>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Original campus story · 4 scenes · 30 seconds · Family-friendly
          </p>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
              Consistent Characters &amp; Outfits Across All 4 Scenes
            </h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Every scene keeps the same outfits, studio color palette, and character voices.
            </p>

            <div className="mt-5 divide-y divide-[var(--border-hairline)]">
              {CHARACTER_BIBLE.map((char) => (
                <div
                  key={char.role}
                  className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <span
                      aria-hidden="true"
                      className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                      style={{ backgroundColor: char.swatchHex }}
                    >
                      {char.name[0]}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-base font-bold text-[var(--text-primary)]">
                          {char.name}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          · {char.voiceLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                        {char.outfit}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-[var(--text-muted)] sm:text-right shrink-0">
                    {char.colors}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
