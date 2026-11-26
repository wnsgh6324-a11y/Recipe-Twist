import type {
  AnimationStyle,
  DialogueLine,
  SceneItem,
  SpeakerRole,
} from "../types/story";
import { ANIMATION_STYLES } from "../data/defaultStory";

export interface TimedLine {
  line: DialogueLine;
  sceneNumber: 1 | 2 | 3 | 4;
  startSec: number;
  endSec: number;
}

const backdropCache = new Map<string, HTMLImageElement>();

export function preloadStyleBackdrops(): void {
  if (typeof window === "undefined") return;
  for (const style of ANIMATION_STYLES) {
    if (!backdropCache.has(style.id)) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = style.backdropUrl;
      backdropCache.set(style.id, img);
    }
  }
}

function getBackdropImage(style: AnimationStyle): HTMLImageElement | null {
  const cached = backdropCache.get(style);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }
  const opt = ANIMATION_STYLES.find((s) => s.id === style);
  if (opt && !cached && typeof window !== "undefined") {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = opt.backdropUrl;
    backdropCache.set(style, img);
  }
  return null;
}

/**
 * Wrap subtitle text into maximum 2 balanced white bold lines.
 */
function wrapSubtitleTwoLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return [];

  const words = clean.split(" ");
  if (ctx.measureText(clean).width <= maxWidth) {
    return [clean];
  }

  // Find balanced split point
  let bestSplit = Math.ceil(words.length / 2);
  let bestDiff = Infinity;

  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(" ");
    const l2 = words.slice(i).join(" ");
    const w1 = ctx.measureText(l1).width;
    const w2 = ctx.measureText(l2).width;
    if (w1 <= maxWidth && w2 <= maxWidth) {
      const diff = Math.abs(w1 - w2);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSplit = i;
      }
    }
  }

  const line1Words: string[] = [];
  let idx = 0;
  while (idx < words.length) {
    const candidate = [...line1Words, words[idx]].join(" ");
    if (ctx.measureText(candidate).width <= maxWidth && idx < bestSplit) {
      line1Words.push(words[idx]);
      idx++;
    } else if (line1Words.length === 0) {
      line1Words.push(words[idx]);
      idx++;
      break;
    } else {
      break;
    }
  }

  const line1 = line1Words.join(" ");
  let line2 = words.slice(idx).join(" ");
  if (!line2) return [line1];

  while (ctx.measureText(line2).width > maxWidth && line2.length > 4) {
    line2 = line2.slice(0, -4).trimEnd() + "…";
  }

  return [line1, line2];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

interface CharacterRenderOpts {
  x: number;
  y: number;
  scale: number;
  style: AnimationStyle;
  isTalking: boolean;
  talkPhase: number;
  blink: boolean;
  expression: "neutral" | "nervous" | "happy" | "firm" | "amazed";
  armPose: "rest" | "wave" | "chest" | "present" | "grate" | "taste" | "cheer";
  facing?: 1 | -1;
}

function drawStyleStroke(
  ctx: CanvasRenderingContext2D,
  style: AnimationStyle,
  width = 3
) {
  if (style === "2d") {
    ctx.strokeStyle = "#2B2420";
    ctx.lineWidth = width;
    ctx.stroke();
  } else if (style === "watercolor") {
    ctx.strokeStyle = "rgba(62, 54, 48, 0.58)";
    ctx.lineWidth = width * 0.72;
    ctx.stroke();
  } else if (style === "clay") {
    ctx.strokeStyle = "rgba(75, 58, 44, 0.25)";
    ctx.lineWidth = width * 0.6;
    ctx.stroke();
  }
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  role: SpeakerRole,
  opts: CharacterRenderOpts
) {
  const {
    x,
    y,
    scale,
    style,
    isTalking,
    talkPhase,
    blink,
    expression,
    armPose,
    facing = 1,
  } = opts;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);

  const is3D = style === "3d";
  const isClay = style === "clay";
  const isWatercolor = style === "watercolor";

  // Subtle shadow under torso on counter
  ctx.fillStyle = isWatercolor ? "rgba(60, 50, 40, 0.10)" : "rgba(30, 24, 18, 0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 145, 78, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Palette per character (locked for consistency across all 4 scenes)
  const palette =
    role === "Mia"
      ? {
          skin: "#F7D9C4",
          skinShade: "#E6BCA2",
          hair: "#362721",
          hairHighlight: "#5A443A",
          top: "#FAF3E8",
          topShade: "#E8DDD0",
          apron: "#5E8B7E",
          apronShade: "#466B60",
          clip: "#D96B43",
        }
      : role === "Alex"
        ? {
            skin: "#F2CEB2",
            skinShade: "#DEB08E",
            hair: "#4A3528",
            hairHighlight: "#6E503E",
            top: "#EDE4D8",
            topShade: "#D6C9B8",
            apron: "#3D5A80",
            apronShade: "#2B415E",
            clip: "#D99B26",
          }
        : {
            skin: "#F4D3BA",
            skinShade: "#DFB699",
            hair: "#6B7280",
            hairHighlight: "#9CA3AF",
            top: "#334155",
            topShade: "#1E293B",
            apron: "#F8FAFC",
            apronShade: "#E2E8F0",
            clip: "#D99B26",
          };

  // Back hair for Mia
  if (role === "Mia") {
    ctx.fillStyle = palette.hair;
    drawRoundedRect(ctx, -64, -135, 128, 120, 48);
    ctx.fill();
    drawStyleStroke(ctx, style, 2.8);
  }

  // Torso / sweater or blazer
  if (is3D || isClay) {
    const grad = ctx.createLinearGradient(-55, -10, 55, 140);
    grad.addColorStop(0, palette.top);
    grad.addColorStop(1, palette.topShade);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = palette.top;
  }
  drawRoundedRect(ctx, -64, 5, 128, 142, isClay ? 42 : 34);
  ctx.fill();
  drawStyleStroke(ctx, style, 3);

  // Alex's subtle horizontal shirt stripes
  if (role === "Alex") {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(61, 90, 128, 0.16)";
    for (let sy = 22; sy < 140; sy += 22) {
      ctx.fillRect(-70, sy, 140, 6);
    }
    ctx.restore();
  }

  // Apron (Mia & Alex) or Judge Shirt/Tie
  if (role === "Judge") {
    ctx.fillStyle = palette.apron;
    ctx.beginPath();
    ctx.moveTo(-22, 6);
    ctx.lineTo(22, 6);
    ctx.lineTo(0, 90);
    ctx.closePath();
    ctx.fill();
    // Pocket square / gold lapel pin
    ctx.fillStyle = palette.clip;
    ctx.beginPath();
    ctx.arc(-34, 48, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Apron straps
    ctx.fillStyle = palette.apronShade;
    ctx.fillRect(-34, 8, 12, 34);
    ctx.fillRect(22, 8, 12, 34);

    // Apron body
    if (is3D || isClay) {
      const aGrad = ctx.createLinearGradient(-46, 30, 46, 145);
      aGrad.addColorStop(0, palette.apron);
      aGrad.addColorStop(1, palette.apronShade);
      ctx.fillStyle = aGrad;
    } else {
      ctx.fillStyle = palette.apron;
    }
    drawRoundedRect(ctx, -46, 30, 92, 117, 16);
    ctx.fill();
    drawStyleStroke(ctx, style, 2.6);

    // Apron front pocket
    ctx.fillStyle = isWatercolor
      ? "rgba(255,255,255,0.28)"
      : "rgba(255,255,255,0.16)";
    drawRoundedRect(ctx, -26, 84, 52, 34, 8);
    ctx.fill();
    drawStyleStroke(ctx, style, 1.8);
  }

  // Neck
  ctx.fillStyle = palette.skinShade;
  drawRoundedRect(ctx, -16, -24, 32, 36, 10);
  ctx.fill();

  // Head
  if (is3D || isClay) {
    const hGrad = ctx.createRadialGradient(-16, -92, 10, 0, -76, 68);
    hGrad.addColorStop(0, palette.skin);
    hGrad.addColorStop(1, palette.skinShade);
    ctx.fillStyle = hGrad;
  } else {
    ctx.fillStyle = palette.skin;
  }
  ctx.beginPath();
  ctx.ellipse(0, -76, 54, 58, 0, 0, Math.PI * 2);
  ctx.fill();
  drawStyleStroke(ctx, style, 3);

  // Soft cheek blush
  ctx.fillStyle =
    expression === "nervous"
      ? "rgba(217, 107, 67, 0.28)"
      : "rgba(235, 130, 110, 0.22)";
  ctx.beginPath();
  ctx.ellipse(-28, -62, 11, 6, 0, 0, Math.PI * 2);
  ctx.ellipse(28, -62, 11, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeY = -80;
  for (const ex of [-20, 20]) {
    if (blink) {
      ctx.strokeStyle = "#2B2420";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ex - 8, eyeY);
      ctx.quadraticCurveTo(ex, eyeY + 4, ex + 8, eyeY);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#231F1E";
      const eyeH = expression === "amazed" ? 9 : 7.5;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 6.5, eyeH, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eye catchlight
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(ex - 2, eyeY - 2.5, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Judge round glasses
  if (role === "Judge") {
    ctx.strokeStyle = "#4A3528";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-20, eyeY, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(20, eyeY, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-7, eyeY);
    ctx.lineTo(7, eyeY);
    ctx.stroke();
  }

  // Eyebrows
  ctx.strokeStyle = palette.hair;
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  if (expression === "nervous") {
    ctx.beginPath();
    ctx.moveTo(-29, -96);
    ctx.lineTo(-13, -101);
    ctx.moveTo(13, -101);
    ctx.lineTo(29, -96);
    ctx.stroke();
  } else if (expression === "firm") {
    ctx.beginPath();
    ctx.moveTo(-29, -100);
    ctx.lineTo(-12, -94);
    ctx.moveTo(12, -94);
    ctx.lineTo(29, -100);
    ctx.stroke();
  } else if (expression === "amazed" || expression === "happy") {
    ctx.beginPath();
    ctx.moveTo(-28, -99);
    ctx.quadraticCurveTo(-20, -105, -12, -99);
    ctx.moveTo(12, -99);
    ctx.quadraticCurveTo(20, -105, 28, -99);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-28, -97);
    ctx.lineTo(-12, -97);
    ctx.moveTo(12, -97);
    ctx.lineTo(28, -97);
    ctx.stroke();
  }

  // Mouth (animated lip sync when talking)
  const mouthY = -46;
  const openAmt = isTalking ? 4 + Math.abs(Math.sin(talkPhase * 14)) * 9 : 0;
  if (openAmt > 1.5) {
    ctx.fillStyle = "#8C3B32";
    ctx.beginPath();
    ctx.ellipse(0, mouthY, 10, openAmt, 0, 0, Math.PI * 2);
    ctx.fill();
    drawStyleStroke(ctx, style, 2);
  } else if (expression === "happy" || expression === "amazed") {
    ctx.strokeStyle = "#5C3028";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, mouthY - 3, 12, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (expression === "nervous") {
    ctx.strokeStyle = "#5C3028";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, mouthY + 2);
    ctx.quadraticCurveTo(-4, mouthY - 3, 0, mouthY + 2);
    ctx.quadraticCurveTo(4, mouthY + 6, 10, mouthY + 1);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#5C3028";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, mouthY);
    ctx.quadraticCurveTo(0, mouthY + 6, 10, mouthY);
    ctx.stroke();
  }

  // Front Hair
  ctx.fillStyle = palette.hair;
  if (role === "Mia") {
    ctx.beginPath();
    ctx.moveTo(-56, -84);
    ctx.quadraticCurveTo(-54, -142, 0, -142);
    ctx.quadraticCurveTo(54, -142, 56, -84);
    ctx.quadraticCurveTo(28, -110, 4, -96);
    ctx.quadraticCurveTo(-24, -114, -56, -84);
    ctx.closePath();
    ctx.fill();
    drawStyleStroke(ctx, style, 2.5);
    // Hairclip
    ctx.fillStyle = palette.clip;
    drawRoundedRect(ctx, 22, -112, 16, 6, 3);
    ctx.fill();
  } else if (role === "Alex") {
    ctx.beginPath();
    ctx.moveTo(-55, -88);
    ctx.quadraticCurveTo(-48, -146, 0, -144);
    ctx.quadraticCurveTo(52, -146, 56, -90);
    ctx.quadraticCurveTo(32, -116, 10, -104);
    ctx.quadraticCurveTo(-12, -120, -34, -104);
    ctx.quadraticCurveTo(-46, -102, -55, -88);
    ctx.closePath();
    ctx.fill();
    drawStyleStroke(ctx, style, 2.5);
  } else {
    ctx.beginPath();
    ctx.moveTo(-54, -88);
    ctx.quadraticCurveTo(-48, -142, 0, -142);
    ctx.quadraticCurveTo(50, -142, 54, -88);
    ctx.quadraticCurveTo(20, -114, -16, -108);
    ctx.quadraticCurveTo(-40, -105, -54, -88);
    ctx.closePath();
    ctx.fill();
    drawStyleStroke(ctx, style, 2.5);
  }

  // Arms / Hands by pose
  const drawArm = (ax: number, ay: number, bx: number, by: number) => {
    ctx.strokeStyle = palette.top;
    ctx.lineWidth = 22;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    if (style === "2d") {
      ctx.strokeStyle = "#2B2420";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx, by, 13, 0, Math.PI * 2);
      ctx.fillStyle = palette.skin;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = palette.skin;
      ctx.beginPath();
      ctx.arc(bx, by, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  if (armPose === "chest") {
    drawArm(-56, 36, -24, 58);
    drawArm(56, 36, 22, 56);
  } else if (armPose === "wave") {
    const waveOffset = Math.sin(talkPhase * 8) * 10;
    drawArm(-56, 36, -68, 88);
    drawArm(56, 36, 84, -4 + waveOffset);
  } else if (armPose === "present") {
    drawArm(-56, 36, -66, 84);
    drawArm(56, 36, 92, 42);
  } else if (armPose === "grate") {
    const grateBob = Math.sin(talkPhase * 10) * 8;
    drawArm(-56, 36, -86, 38 + grateBob);
    drawArm(56, 36, 76, 62);
  } else if (armPose === "taste") {
    drawArm(-56, 36, -68, 86);
    drawArm(56, 36, 38, -22);
  } else if (armPose === "cheer") {
    drawArm(-56, 36, -42, -32);
    drawArm(56, 36, 42, -32);
  } else {
    drawArm(-56, 36, -68, 92);
    drawArm(56, 36, 68, 92);
  }

  ctx.restore();
}

function drawPancakeStack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: AnimationStyle,
  withZest: boolean
) {
  ctx.save();
  ctx.translate(x, y);

  // Plate
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(0, 26, 94, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  drawStyleStroke(ctx, style, 2.6);

  // Three golden pancakes
  const layers = [
    { dy: 12, rx: 66 },
    { dy: 0, rx: 62 },
    { dy: -12, rx: 58 },
  ];
  for (const layer of layers) {
    ctx.fillStyle = "#E89B4C";
    ctx.beginPath();
    ctx.ellipse(0, layer.dy + 4, layer.rx, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    drawStyleStroke(ctx, style, 2.2);

    ctx.fillStyle = "#F4BE6A";
    ctx.beginPath();
    ctx.ellipse(0, layer.dy, layer.rx - 2, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Syrup drizzle
  ctx.fillStyle = "#A9571D";
  ctx.beginPath();
  ctx.ellipse(0, -14, 34, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Butter pat
  ctx.fillStyle = "#FDE68A";
  drawRoundedRect(ctx, -12, -23, 24, 11, 3);
  ctx.fill();
  drawStyleStroke(ctx, style, 1.5);

  if (withZest) {
    ctx.strokeStyle = "#F97316";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = -24; i <= 24; i += 10) {
      ctx.beginPath();
      ctx.moveTo(i, -16);
      ctx.quadraticCurveTo(i + 5, -24, i + 9, -15);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawButterfly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  flapPhase: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  const flap = 0.5 + 0.5 * Math.cos(flapPhase);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(-7 * flap, -3, 8 * flap, 6, -0.4, 0, Math.PI * 2);
  ctx.ellipse(7 * flap, -3, 8 * flap, 6, 0.4, 0, Math.PI * 2);
  ctx.ellipse(-5 * flap, 5, 6 * flap, 4.5, 0.3, 0, Math.PI * 2);
  ctx.ellipse(5 * flap, 5, 6 * flap, 4.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPizzaBowl(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: AnimationStyle
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#E5E7EB";
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  drawStyleStroke(ctx, style, 2.5);

  // Red tomato sauce & pepperoni circles
  ctx.fillStyle = "#DC2626";
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FBBF24";
  ctx.beginPath();
  ctx.arc(-10, -2, 6, 0, Math.PI * 2);
  ctx.arc(12, 1, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#991B1B";
  ctx.beginPath();
  ctx.arc(2, -4, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawOrangeAndZester(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: AnimationStyle,
  fallPhase: number
) {
  ctx.save();
  ctx.translate(x, y);
  // Fresh bright orange
  ctx.fillStyle = "#F97316";
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  drawStyleStroke(ctx, style, 2.4);
  // Leaf
  ctx.fillStyle = "#4A7866";
  ctx.beginPath();
  ctx.ellipse(12, -22, 10, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Falling zest curls
  ctx.strokeStyle = "#FB923C";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const dy = ((fallPhase * 65 + i * 18) % 90) + 28;
    const dx = Math.sin(i * 1.7 + fallPhase * 3) * 18 - 10;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.quadraticCurveTo(dx + 6, dy + 4, dx + 2, dy + 9);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rawTimeSec: number,
  style: AnimationStyle,
  scenes: SceneItem[],
  timings: TimedLine[]
): void {
  const timeSec =
    style === "clay" ? Math.floor(rawTimeSec * 12) / 12 : Math.max(0, rawTimeSec);

  const activeScene =
    scenes.find((s) => timeSec >= s.startSec && timeSec < s.endSec) ??
    scenes[scenes.length - 1];
  const sceneDur = Math.max(1, activeScene.endSec - activeScene.startSec);
  const sceneProgress = Math.min(
    1,
    Math.max(0, (timeSec - activeScene.startSec) / sceneDur)
  );

  const activeLine = timings.find(
    (t) => rawTimeSec >= t.startSec && rawTimeSec <= t.endSec
  );

  ctx.clearRect(0, 0, width, height);

  // 1. Background image with subtle Ken Burns pan/zoom per scene
  const bg = getBackdropImage(style);
  ctx.save();
  const zoom =
    activeScene.sceneNumber === 1
      ? 1.03 + sceneProgress * 0.04
      : activeScene.sceneNumber === 2
        ? 1.07 - sceneProgress * 0.03
        : activeScene.sceneNumber === 3
          ? 1.04 + sceneProgress * 0.05
          : 1.08 - sceneProgress * 0.04;
  const panX = (activeScene.sceneNumber % 2 === 0 ? -1 : 1) * sceneProgress * 18;
  ctx.translate(width / 2 + panX, height / 2);
  ctx.scale(zoom, zoom);

  if (bg) {
    const imgRatio = bg.naturalWidth / bg.naturalHeight;
    const canvasRatio = width / height;
    let drawW = width;
    let drawH = height;
    if (imgRatio > canvasRatio) {
      drawW = height * imgRatio;
    } else {
      drawH = width / imgRatio;
    }
    ctx.drawImage(bg, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    const fallbackGrad = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
    fallbackGrad.addColorStop(0, "#FAF4EA");
    fallbackGrad.addColorStop(1, "#EADBC8");
    ctx.fillStyle = fallbackGrad;
    ctx.fillRect(-width / 2, -height / 2, width, height);
  }
  ctx.restore();

  // Style atmospheric wash
  if (style === "watercolor") {
    ctx.fillStyle = "rgba(250, 246, 238, 0.22)";
    ctx.fillRect(0, 0, width, height);
  } else if (style === "3d") {
    const warmLight = ctx.createRadialGradient(
      width * 0.3,
      height * 0.2,
      40,
      width * 0.5,
      height * 0.5,
      width * 0.8
    );
    warmLight.addColorStop(0, "rgba(255, 244, 214, 0.16)");
    warmLight.addColorStop(1, "rgba(20, 24, 28, 0.14)");
    ctx.fillStyle = warmLight;
    ctx.fillRect(0, 0, width, height);
  } else if (style === "clay") {
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      width * 0.25,
      width / 2,
      height / 2,
      width * 0.72
    );
    vignette.addColorStop(0, "rgba(255, 255, 255, 0)");
    vignette.addColorStop(1, "rgba(40, 28, 18, 0.18)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  // Soft foreground wooden studio counter bar
  const counterY = 505;
  const counterGrad = ctx.createLinearGradient(0, counterY, 0, height);
  counterGrad.addColorStop(0, "#DFBA8C");
  counterGrad.addColorStop(0.18, "#D4A373");
  counterGrad.addColorStop(1, "#B88456");
  ctx.fillStyle = counterGrad;
  ctx.fillRect(0, counterY, width, height - counterY);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(0, counterY, width, 4);

  const blink = Math.floor(timeSec * 0.45) !== Math.floor((timeSec - 0.12) * 0.45);
  const talkingSpeaker = activeLine?.line.speaker ?? null;

  // 2. Scene choreography
  if (activeScene.sceneNumber === 1) {
    // Judge arriving subtly in background
    drawCharacter(ctx, "Judge", {
      x: 1030 - sceneProgress * 45,
      y: 265,
      scale: 0.62,
      style,
      isTalking: false,
      talkPhase: timeSec,
      blink,
      expression: "neutral",
      armPose: "rest",
      facing: -1,
    });

    // Mia nervous on left
    const miaJitter = Math.sin(timeSec * 8) * 2.5;
    drawCharacter(ctx, "Mia", {
      x: 375 + miaJitter,
      y: 356,
      scale: 1.05,
      style,
      isTalking: talkingSpeaker === "Mia",
      talkPhase: rawTimeSec,
      blink,
      expression: "nervous",
      armPose: "chest",
      facing: 1,
    });

    // Floating butterflies around Mia
    const bColors = ["#F4A261", "#98C1D9", "#E9C46A", "#84A98C"];
    for (let i = 0; i < 4; i++) {
      const bx = 250 + i * 75 + Math.sin(timeSec * 2.4 + i) * 24;
      const by = 225 + Math.cos(timeSec * 3.1 + i * 1.4) * 20;
      drawButterfly(ctx, bx, by, timeSec * 11 + i, bColors[i]);
    }

    // Alex calm on right
    drawCharacter(ctx, "Alex", {
      x: 845,
      y: 354,
      scale: 1.06,
      style,
      isTalking: talkingSpeaker === "Alex",
      talkPhase: rawTimeSec,
      blink,
      expression: "happy",
      armPose: "present",
      facing: -1,
    });

    drawPancakeStack(ctx, 635, 492, style, false);
  } else if (activeScene.sceneNumber === 2) {
    // Mia objecting firmly on left
    drawCharacter(ctx, "Mia", {
      x: 380,
      y: 356,
      scale: 1.08,
      style,
      isTalking: talkingSpeaker === "Mia",
      talkPhase: rawTimeSec,
      blink,
      expression: "firm",
      armPose: "wave",
      facing: 1,
    });

    // Alex holding pizza toppings bowl on right
    drawCharacter(ctx, "Alex", {
      x: 870,
      y: 356,
      scale: 1.06,
      style,
      isTalking: talkingSpeaker === "Alex",
      talkPhase: rawTimeSec,
      blink,
      expression: "neutral",
      armPose: "present",
      facing: -1,
    });

    drawPancakeStack(ctx, 560, 495, style, false);
    drawPizzaBowl(ctx, 735 - sceneProgress * 22, 494, style);
  } else if (activeScene.sceneNumber === 3) {
    // Mia watching thoughtfully
    drawCharacter(ctx, "Mia", {
      x: 365,
      y: 356,
      scale: 1.05,
      style,
      isTalking: talkingSpeaker === "Mia",
      talkPhase: rawTimeSec,
      blink,
      expression: "happy",
      armPose: "present",
      facing: 1,
    });

    // Alex grating orange zest onto pancakes
    drawCharacter(ctx, "Alex", {
      x: 830,
      y: 354,
      scale: 1.08,
      style,
      isTalking: talkingSpeaker === "Alex",
      talkPhase: rawTimeSec,
      blink,
      expression: "happy",
      armPose: "grate",
      facing: -1,
    });

    // Empty strawberry carton
    ctx.save();
    ctx.translate(440, 492);
    ctx.fillStyle = "#E7E5E4";
    drawRoundedRect(ctx, -34, -22, 68, 34, 8);
    ctx.fill();
    drawStyleStroke(ctx, style, 2.2);
    ctx.restore();

    drawPancakeStack(ctx, 640, 494, style, sceneProgress > 0.35);
    drawOrangeAndZester(ctx, 665, 376 + Math.sin(timeSec * 6) * 5, style, timeSec);
  } else {
    // Scene 4: Judge tastes and praises; Mia & Alex thrilled
    drawCharacter(ctx, "Mia", {
      x: 325,
      y: 362,
      scale: 1.03,
      style,
      isTalking: talkingSpeaker === "Mia",
      talkPhase: rawTimeSec,
      blink,
      expression: "amazed",
      armPose: "cheer",
      facing: 1,
    });

    drawCharacter(ctx, "Alex", {
      x: 955,
      y: 360,
      scale: 1.03,
      style,
      isTalking: talkingSpeaker === "Alex",
      talkPhase: rawTimeSec,
      blink,
      expression: "happy",
      armPose: "cheer",
      facing: -1,
    });

    drawCharacter(ctx, "Judge", {
      x: 640,
      y: 344,
      scale: 1.12,
      style,
      isTalking: talkingSpeaker === "Judge",
      talkPhase: rawTimeSec,
      blink,
      expression: "amazed",
      armPose: "taste",
      facing: 1,
    });

    drawPancakeStack(ctx, 640, 496, style, true);

    // Delight sparkles around Judge
    ctx.fillStyle = "#F59E0B";
    for (let i = 0; i < 5; i++) {
      const sx = 520 + i * 60 + Math.sin(timeSec * 2 + i) * 8;
      const sy = 165 + ((i % 2) * 32) - Math.abs(Math.sin(timeSec * 3 + i)) * 14;
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. Measured bottom gradient scrim + White, Bold, Bottom, Max-2-Line English Subtitles
  const scrim = ctx.createLinearGradient(0, height - 175, 0, height);
  scrim.addColorStop(0, "rgba(15, 20, 18, 0)");
  scrim.addColorStop(0.45, "rgba(15, 20, 18, 0.56)");
  scrim.addColorStop(1, "rgba(15, 20, 18, 0.82)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, height - 175, width, 175);

  if (activeLine) {
    const maxSubWidth = width - 150;
    let fontSize = 31;
    ctx.font = `700 ${fontSize}px "DM Sans", -apple-system, sans-serif`;
    let lines = wrapSubtitleTwoLines(ctx, activeLine.line.text, maxSubWidth);

    // Ensure crisp fit if user edits text longer
    if (lines.length === 2 && ctx.measureText(lines[1]).width > maxSubWidth) {
      fontSize = 26;
      ctx.font = `700 ${fontSize}px "DM Sans", -apple-system, sans-serif`;
      lines = wrapSubtitleTwoLines(ctx, activeLine.line.text, maxSubWidth);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lineHeight = fontSize * 1.32;
    const baseBottomY = lines.length === 2 ? height - 74 : height - 54;

    lines.forEach((txt, idx) => {
      const ly = baseBottomY + idx * lineHeight;
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 2;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
      ctx.lineWidth = 5;
      ctx.strokeText(txt, width / 2, ly);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(txt, width / 2, ly);
      ctx.restore();
    });
  }
}
