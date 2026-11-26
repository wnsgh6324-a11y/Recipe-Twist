import type { AnimationStyle, SceneItem } from "../types/story";
import { renderFrame, type TimedLine } from "./canvasRenderer";

export function estimateLineDurationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.8, Math.min(6.2, words * 0.42 + 0.5));
}

export function computeSceneTimings(scenes: SceneItem[]): TimedLine[] {
  const timings: TimedLine[] = [];

  for (const scene of scenes) {
    const windowStart = scene.startSec + 0.2;
    const windowEnd = scene.endSec - 0.15;
    const available = Math.max(1, windowEnd - windowStart);

    const rawDurations = scene.lines.map(
      (l) => l.audioDurationSec ?? estimateLineDurationSec(l.text)
    );
    const totalRaw = rawDurations.reduce((acc, d) => acc + d, 0);
    const gap = scene.lines.length > 1 ? 0.25 : 0;
    const totalNeeded = totalRaw + gap * Math.max(0, scene.lines.length - 1);
    const scale = totalNeeded > available ? available / totalNeeded : 1;

    let cursor = windowStart;
    scene.lines.forEach((line, idx) => {
      const dur = rawDurations[idx] * scale;
      const startSec = cursor;
      const endSec = Math.min(windowEnd, startSec + dur);
      timings.push({
        line,
        sceneNumber: scene.sceneNumber,
        startSec,
        endSec,
      });
      cursor = endSec + gap * scale;
    });
  }

  return timings;
}

export async function decodeWavBase64(
  ctx: AudioContext,
  base64: string
): Promise<AudioBuffer> {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return await ctx.decodeAudioData(bytes.buffer.slice(0));
}

export async function measureBase64Duration(base64: string): Promise<number> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const buffer = await decodeWavBase64(ctx, base64);
    return buffer.duration;
  } finally {
    await ctx.close();
  }
}

export function pickSupportedVideoMimeType(): {
  mimeType: string;
  extension: string;
} {
  const candidates = [
    { mimeType: "video/mp4;codecs=avc1,mp4a.40.2", extension: "mp4" },
    { mimeType: "video/mp4", extension: "mp4" },
    { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ];

  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "video/webm", extension: "webm" };
  }

  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: "", extension: "webm" };
}

export async function exportCompositeVideo(options: {
  style: AnimationStyle;
  scenes: SceneItem[];
  timings: TimedLine[];
  onProgress: (elapsedSec: number, totalSec: number) => void;
  signal?: AbortSignal;
}): Promise<{ blob: Blob; extension: string }> {
  const { style, scenes, timings, onProgress, signal } = options;
  const totalSec = 30;
  const width = 1280;
  const height = 720;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to initialize video canvas context.");
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();

  // Schedule all synthesized voice clips onto the export AudioContext
  const startAudioTime = audioCtx.currentTime + 0.12;
  const decodedBuffers: Array<{ buffer: AudioBuffer; timing: TimedLine }> = [];
  for (const timing of timings) {
    if (timing.line.audioBase64) {
      try {
        const buffer = await decodeWavBase64(audioCtx, timing.line.audioBase64);
        decodedBuffers.push({ buffer, timing });
      } catch {
        // Ignore malformed audio buffer
      }
    }
  }

  for (const { buffer, timing } of decodedBuffers) {
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const slotDuration = Math.max(0.5, timing.endSec - timing.startSec);
    if (buffer.duration > slotDuration) {
      src.playbackRate.value = Math.min(1.35, buffer.duration / slotDuration);
    }
    src.connect(dest);
    src.start(startAudioTime + timing.startSec);
  }

  const videoStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const { mimeType, extension } = pickSupportedVideoMimeType();
  const recorder = mimeType
    ? new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 4_500_000,
      })
    : new MediaRecorder(combinedStream);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return await new Promise<{ blob: Blob; extension: string }>((resolve, reject) => {
    let rafId = 0;
    const startPerf = performance.now();

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      combinedStream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
    };

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          if (recorder.state !== "inactive") recorder.stop();
          cleanup();
          reject(new Error("Export cancelled."));
        },
        { once: true }
      );
    }

    recorder.onstop = () => {
      cleanup();
      if (signal?.aborted) return;
      const finalBlob = new Blob(chunks, {
        type: mimeType || "video/webm",
      });
      resolve({ blob: finalBlob, extension });
    };

    recorder.onerror = () => {
      cleanup();
      reject(new Error("Video recording failed in this browser."));
    };

    recorder.start(250);

    const step = () => {
      if (signal?.aborted) return;
      const elapsed = (performance.now() - startPerf) / 1000;
      const clamped = Math.min(totalSec, elapsed);
      renderFrame(ctx, width, height, clamped, style, scenes, timings);
      onProgress(clamped, totalSec);

      if (elapsed >= totalSec) {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
        return;
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
  });
}
