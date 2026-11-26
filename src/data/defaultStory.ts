import type {
  CharacterProfile,
  ExpressionItem,
  SceneItem,
  StyleOption,
} from "../types/story";

export const STORY_TITLE = "The Unexpected Recipe";

export const STORY_SUMMARY =
  "Two university students, Mia and Alex, enter a campus cooking competition. Mia gets pre-contest jitters, they clash over savory vs. sweet pancake toppings, discover they are out of strawberries, improvise with fresh orange zest, and unexpectedly win over the judge.";

export const CHARACTER_BIBLE: CharacterProfile[] = [
  {
    role: "Mia",
    name: "Mia",
    outfit: "Cream knit sweater, sage-green apron, dark chestnut bob with sage hairclip",
    colors: "Cream (#FAF3E8) & Sage (#5E8B7E)",
    personality: "Detail-oriented, expressive, cares about balanced sweet flavors",
    voiceLabel: "Bright female student voice",
    swatchHex: "#5E8B7E",
  },
  {
    role: "Alex",
    name: "Alex",
    outfit: "Warm oatmeal-striped tee, slate-navy apron, wavy brown hair",
    colors: "Oatmeal (#EDE4D8) & Slate Navy (#3D5A80)",
    personality: "Calm under pressure, spontaneous, loves bold flavor twists",
    voiceLabel: "Warm male student voice",
    swatchHex: "#3D5A80",
  },
  {
    role: "Judge",
    name: "Judge",
    outfit: "Crisp charcoal blazer, ivory shirt, round tortoiseshell glasses",
    colors: "Charcoal (#334155) & Warm Gold (#D99B26)",
    personality: "Thoughtful culinary judge who appreciates creative harmony",
    voiceLabel: "Composed judge voice",
    swatchHex: "#334155",
  },
];

export const ANIMATION_STYLES: StyleOption[] = [
  {
    id: "2d",
    name: "2D",
    koreanLabel: "2D 셀 애니메이션",
    shortDesc: "Crisp ink outlines and warm cel-shaded studio tones",
    backdropUrl: "/src/assets/images/stage_2d_kitchen_1795580807082.jpg",
    accentHex: "#D96B43",
  },
  {
    id: "3d",
    name: "3D",
    koreanLabel: "3D 입체 애니메이션",
    shortDesc: "Soft volumetric lighting and smooth rounded studio depth",
    backdropUrl: "/src/assets/images/stage_3d_kitchen_1795580808248.jpg",
    accentHex: "#3D5A80",
  },
  {
    id: "clay",
    name: "Clay",
    koreanLabel: "클레이 스톱모션",
    shortDesc: "Tactile handcrafted clay textures with charming 12fps motion",
    backdropUrl: "/src/assets/images/stage_clay_kitchen_1795580808644.jpg",
    accentHex: "#B87C19",
  },
  {
    id: "watercolor",
    name: "Watercolor",
    koreanLabel: "수채화 일러스트",
    shortDesc: "Gentle hand-painted washes on textured cold-press paper",
    backdropUrl: "/src/assets/images/stage_watercolor_kitchen_1795580809097.jpg",
    accentHex: "#4A7866",
  },
];

export const DEFAULT_EXPRESSIONS: ExpressionItem[] = [
  {
    id: "expr-1",
    index: 1,
    phrase: "I've got butterflies.",
    koreanMeaning: "긴장돼서 속이 두근거려요 (배 속에 나비가 날아다니는 기분이에요).",
    sourceMovie: "Inside Out 2",
    nuanceNote: "Used when feeling nervous excitement before a big moment like an exam, presentation, or contest.",
  },
  {
    id: "expr-2",
    index: 2,
    phrase: "Keep it together.",
    koreanMeaning: "침착해, 정신 바짝 차려.",
    sourceMovie: "Inside Out 2",
    nuanceNote: "A reassuring phrase to tell yourself or a friend to stay calm and focused under stress.",
  },
  {
    id: "expr-3",
    index: 3,
    phrase: "I'm not into that vibe at all.",
    koreanMeaning: "그런 분위기/스타일은 전혀 내 취향이 아니야.",
    sourceMovie: "Inside Out 2",
    nuanceNote: "Casual, everyday way to disagree with an idea, mood, or combination that feels off.",
  },
  {
    id: "expr-4",
    index: 4,
    phrase: "I was going to add strawberries, but I've changed my mind.",
    koreanMeaning: "원래 딸기를 넣으려고 했는데, 마음이 바뀌었어.",
    sourceMovie: "Notting Hill – adapted pattern",
    nuanceNote: "Combines 'I was going to...' (past intention) with 'I've changed my mind' (new decision).",
  },
  {
    id: "expr-5",
    index: 5,
    phrase: "Surreal but nice.",
    koreanMeaning: "초현실적이지만 좋네요 (뜻밖이지만 정말 근사해요).",
    sourceMovie: "Notting Hill",
    nuanceNote: "Polite, slightly amazed compliment when something unusual turns out unexpectedly wonderful.",
  },
];

export const DEFAULT_SCENES: SceneItem[] = [
  {
    id: "scene-1",
    sceneNumber: 1,
    label: "Hook",
    startSec: 0,
    endSec: 7,
    title: "Pre-Contest Jitters",
    description:
      "Inside the sunlit university cooking studio, Mia spots the judges arriving near their counter and feels nervous, while Alex calms her down beside a fresh stack of golden pancakes.",
    clipReady: true,
    lines: [
      {
        id: "s1-l1",
        speaker: "Mia",
        text: "I've got butterflies. The judges are already here!",
        koreanText: "긴장돼서 두근거려요. 심사위원들이 벌써 왔어요!",
        expressionId: "expr-1",
        styleHint: "Nervous, whispering excitedly with fluttering energy",
      },
      {
        id: "s1-l2",
        speaker: "Alex",
        text: "Keep it together. Our pancakes are ready.",
        koreanText: "침착해. 우리 팬케이크는 이미 준비됐잖아.",
        expressionId: "expr-2",
        styleHint: "Calm, reassuring, steady teammate tone",
      },
    ],
  },
  {
    id: "scene-2",
    sceneNumber: 2,
    label: "Problem",
    startSec: 7,
    endSec: 15,
    title: "Topping Disagreement",
    description:
      "Alex reaches for a bowl of savory pizza-style toppings to put on their sweet pancakes, and Mia firmly shakes her head to keep the dessert clean and balanced.",
    clipReady: true,
    lines: [
      {
        id: "s2-l1",
        speaker: "Mia",
        text: "I'm not into that vibe at all. Sweet pancakes shouldn't taste like pizza. Let's keep it simple.",
        koreanText:
          "그런 느낌은 전혀 아니야. 달콤한 팬케이크에서 피자 맛이 나면 안 되지. 단순하게 가자.",
        expressionId: "expr-3",
        styleHint: "Playfully firm, expressive, convincing",
      },
    ],
  },
  {
    id: "scene-3",
    sceneNumber: 3,
    label: "Turn",
    startSec: 15,
    endSec: 23,
    title: "The Citrus Twist",
    description:
      "They notice the strawberry basket is completely empty. Thinking fast, Alex picks up a bright fresh orange and asks Mia for the zester to finish the pancakes with fragrant orange zest.",
    clipReady: true,
    lines: [
      {
        id: "s3-l1",
        speaker: "Alex",
        text: "I was going to add strawberries, but I've changed my mind. Pass me the orange zest instead.",
        koreanText:
          "원래 딸기를 넣으려고 했는데, 마음이 바뀌었어. 대신 오렌지 제스트 좀 건네줘.",
        expressionId: "expr-4",
        styleHint: "Quick-thinking, upbeat, inspired",
      },
    ],
  },
  {
    id: "scene-4",
    sceneNumber: 4,
    label: "Close",
    startSec: 23,
    endSec: 30,
    title: "Unexpected Praise",
    description:
      "The judge takes a careful bite of the warm orange-zest pancakes, lights up with genuine delight, and leaves Mia speechless with joy.",
    clipReady: true,
    lines: [
      {
        id: "s4-l1",
        speaker: "Judge",
        text: "Surreal but nice. This is the best dessert here.",
        koreanText: "초현실적이지만 정말 좋네요. 여기 있는 디저트 중 최고예요.",
        expressionId: "expr-5",
        styleHint: "Thoughtfully surprised, genuinely impressed",
      },
      {
        id: "s4-l2",
        speaker: "Mia",
        text: "Wait, are you serious?",
        koreanText: "잠깐만요, 진심이세요?",
        styleHint: "Bright, happily shocked disbelief",
      },
    ],
  },
];
