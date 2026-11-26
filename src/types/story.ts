export type AnimationStyle = "2d" | "3d" | "clay" | "watercolor";

export type SpeakerRole = "Mia" | "Alex" | "Judge";

export interface ExpressionItem {
  id: string;
  index: number;
  phrase: string;
  koreanMeaning: string;
  sourceMovie: string;
  nuanceNote: string;
}

export interface DialogueLine {
  id: string;
  speaker: SpeakerRole;
  text: string;
  koreanText: string;
  expressionId?: string;
  styleHint?: string;
  audioBase64?: string;
  audioDurationSec?: number;
}

export interface SceneItem {
  id: string;
  sceneNumber: 1 | 2 | 3 | 4;
  label: "Hook" | "Problem" | "Turn" | "Close";
  startSec: number;
  endSec: number;
  title: string;
  description: string;
  lines: DialogueLine[];
  clipReady: boolean;
  generatedStyle?: AnimationStyle;
}

export interface StyleOption {
  id: AnimationStyle;
  name: string;
  koreanLabel: string;
  shortDesc: string;
  backdropUrl: string;
  accentHex: string;
}

export interface CharacterProfile {
  role: SpeakerRole;
  name: string;
  outfit: string;
  colors: string;
  personality: string;
  voiceLabel: string;
  swatchHex: string;
}
