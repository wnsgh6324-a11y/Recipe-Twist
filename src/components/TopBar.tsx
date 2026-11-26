import React from "react";
import { Film } from "lucide-react";

interface TopBarProps {
  onJumpToVideo: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onJumpToVideo }) => {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)]/92 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-8 px-4 sm:h-16 sm:px-6">
        <a
          href="#top"
          className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0 sm:text-2xl"
        >
          Recipe Twist
        </a>

        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--text-secondary)]"
        >
          <a
            href="#expressions"
            className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0"
          >
            Expressions
          </a>
          <a
            href="#story"
            className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0"
          >
            Story
          </a>
          <a
            href="#storyboard"
            className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0"
          >
            Storyboard
          </a>
          <a
            href="#studio"
            className="hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0"
          >
            Final Video
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onJumpToVideo}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--accent-coral)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--accent-coral-hover)] active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Film className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Create Video</span>
          </button>
        </div>
      </div>
    </header>
  );
};
