import {
  ArrayBufferTarget as Mp4ArrayBufferTarget,
  Muxer as Mp4Muxer,
} from "mp4-muxer";
import {
  ArrayBufferTarget as WebmArrayBufferTarget,
  Muxer as WebmMuxer,
} from "webm-muxer";
import type { AnimationStyle, SceneItem } from "../types/story";
import {
  renderFrame,
  waitForStyleBackdrop,
  type TimedLine,
} from "./canvasRenderer";

export interface GeneratedVideoArtifact {
  url: string;
  blob: Blob;
  extension: "mp4" | "webm";
  mimeType: string;
  style: AnimationStyle;
  durationSec: number;
  sizeBytes: number;
}

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
  ctx: BaseAudioContext,
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
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const buffer = await decodeWavBase64(ctx, base64);
    return buffer.duration;
  } finally {
    await ctx.close();
  }
}

async function mixVoicesToBuffer(
  timings: TimedLine[],
  totalSec: number,
  sampleRate = 48000
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(1, totalSec * sampleRate, sampleRate);

  for (const timing of timings) {
    if (!timing.line.audioBase64) continue;
    try {
      const decoded = await decodeWavBase64(offlineCtx, timing.line.audioBase64);
      const src = offlineCtx.createBufferSource();
      src.buffer = decoded;
      const slotDuration = Math.max(0.5, timing.endSec - timing.startSec);
      if (decoded.duration > slotDuration) {
        src.playbackRate.value = Math.min(1.35, decoded.duration / slotDuration);
      }
      src.connect(offlineCtx.destination);
      src.start(timing.startSec);
    } catch {
      // Skip malformed line buffer
    }
  }

  return await offlineCtx.startRendering();
}

async function detectWebCodecsTarget(): Promise<{
  format: "mp4" | "webm";
  videoCodec: string;
  audioCodec: string;
} | null> {
  if (
    typeof VideoEncoder === "undefined" ||
    typeof AudioEncoder === "undefined" ||
    typeof VideoFrame === "undefined" ||
    typeof AudioData === "undefined"
  ) {
    return null;
  }

  try {
    const mp4Video = await VideoEncoder.isConfigSupported({
      codec: "avc1.42001f",
      width: 1280,
      height: 720,
      bitrate: 3_000_000,
      framerate: 24,
    });
    const mp4Audio = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: 48000,
      numberOfChannels: 1,
      bitrate: 128_000,
    });
    if (mp4Video.supported && mp4Audio.supported) {
      return {
        format: "mp4",
        videoCodec: "avc1.42001f",
        audioCodec: "mp4a.40.2",
      };
    }
  } catch {
    // Try WebM next
  }

  try {
    const webmVideo = await VideoEncoder.isConfigSupported({
      codec: "vp8",
      width: 1280,
      height: 720,
      bitrate: 3_000_000,
      framerate: 24,
    });
    const webmAudio = await AudioEncoder.isConfigSupported({
      codec: "opus",
      sampleRate: 48000,
      numberOfChannels: 1,
      bitrate: 128_000,
    });
    if (webmVideo.supported && webmAudio.supported) {
      return {
        format: "webm",
        videoCodec: "vp8",
        audioCodec: "opus",
      };
    }
  } catch {
    // Fallback to MediaRecorder
  }

  return null;
}

async function encodeViaWebCodecs(options: {
  targetSpec: { format: "mp4" | "webm"; videoCodec: string; audioCodec: string };
  style: AnimationStyle;
  scenes: SceneItem[];
  timings: TimedLine[];
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<GeneratedVideoArtifact> {
  const { targetSpec, style, scenes, timings, onProgress, signal } = options;
  const width = 1280;
  const height = 720;
  const fps = 24;
  const totalSec = 30;
  const totalFrames = fps * totalSec;
  const frameDurationUs = Math.round(1_000_000 / fps);
  const sampleRate = 48000;

  await waitForStyleBackdrop(style);
  const mixedAudio = await mixVoicesToBuffer(timings, totalSec, sampleRate);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to initialize video canvas context.");
  }

  let encoderFailure: Error | null = null;

  if (targetSpec.format === "mp4") {
    const target = new Mp4ArrayBufferTarget();
    const muxer = new Mp4Muxer({
      target,
      video: { codec: "avc", width, height, frameRate: fps },
      audio: { codec: "aac", numberOfChannels: 1, sampleRate },
      fastStart: "in-memory",
    });

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (err) => {
        encoderFailure = new Error(err.message || "Video encoder failed.");
      },
    });
    videoEncoder.configure({
      codec: targetSpec.videoCodec,
      width,
      height,
      bitrate: 3_000_000,
      framerate: fps,
    });

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (err) => {
        encoderFailure = new Error(err.message || "Audio encoder failed.");
      },
    });
    audioEncoder.configure({
      codec: targetSpec.audioCodec,
      sampleRate,
      numberOfChannels: 1,
      bitrate: 128_000,
    });

    // Encode mixed 30s audio in 0.5s chunks
    const channelData = mixedAudio.getChannelData(0);
    const chunkSamples = sampleRate / 2;
    for (let offset = 0; offset < channelData.length; offset += chunkSamples) {
      if (signal?.aborted) throw new Error("Video generation cancelled.");
      if (encoderFailure) throw encoderFailure;
      const slice = channelData.subarray(
        offset,
        Math.min(offset + chunkSamples, channelData.length)
      );
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: slice.length,
        numberOfChannels: 1,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: slice,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }

    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) throw new Error("Video generation cancelled.");
      if (encoderFailure) throw encoderFailure;

      while (videoEncoder.encodeQueueSize > 8) {
        await new Promise((r) => setTimeout(r, 8));
      }

      const timeSec = f / fps;
      renderFrame(ctx, width, height, timeSec, style, scenes, timings);
      const frame = new VideoFrame(canvas, {
        timestamp: f * frameDurationUs,
        duration: frameDurationUs,
      });
      videoEncoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
      frame.close();

      if (f % 12 === 0) {
        onProgress(Math.round(((f + 1) / totalFrames) * 100));
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    await videoEncoder.flush();
    await audioEncoder.flush();
    videoEncoder.close();
    audioEncoder.close();
    if (encoderFailure) throw encoderFailure;

    muxer.finalize();
    const blob = new Blob([target.buffer], { type: "video/mp4" });
    return {
      url: URL.createObjectURL(blob),
      blob,
      extension: "mp4",
      mimeType: "video/mp4",
      style,
      durationSec: totalSec,
      sizeBytes: blob.size,
    };
  }

  // WebM (VP8 + Opus)
  const target = new WebmArrayBufferTarget();
  const muxer = new WebmMuxer({
    target,
    video: { codec: "V_VP8", width, height, frameRate: fps },
    audio: { codec: "A_OPUS", numberOfChannels: 1, sampleRate },
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderFailure = new Error(err.message || "Video encoder failed.");
    },
  });
  videoEncoder.configure({
    codec: targetSpec.videoCodec,
    width,
    height,
    bitrate: 3_000_000,
    framerate: fps,
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (err) => {
      encoderFailure = new Error(err.message || "Audio encoder failed.");
    },
  });
  audioEncoder.configure({
    codec: targetSpec.audioCodec,
    sampleRate,
    numberOfChannels: 1,
    bitrate: 128_000,
  });

  const channelData = mixedAudio.getChannelData(0);
  const chunkSamples = sampleRate / 2;
  for (let offset = 0; offset < channelData.length; offset += chunkSamples) {
    if (signal?.aborted) throw new Error("Video generation cancelled.");
    if (encoderFailure) throw encoderFailure;
    const slice = channelData.subarray(
      offset,
      Math.min(offset + chunkSamples, channelData.length)
    );
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: slice.length,
      numberOfChannels: 1,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: slice,
    });
    audioEncoder.encode(audioData);
    audioData.close();
  }

  for (let f = 0; f < totalFrames; f++) {
    if (signal?.aborted) throw new Error("Video generation cancelled.");
    if (encoderFailure) throw encoderFailure;

    while (videoEncoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 8));
    }

    const timeSec = f / fps;
    renderFrame(ctx, width, height, timeSec, style, scenes, timings);
    const frame = new VideoFrame(canvas, {
      timestamp: f * frameDurationUs,
      duration: frameDurationUs,
    });
    videoEncoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
    frame.close();

    if (f % 12 === 0) {
      onProgress(Math.round(((f + 1) / totalFrames) * 100));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  videoEncoder.close();
  audioEncoder.close();
  if (encoderFailure) throw encoderFailure;

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/webm" });
  return {
    url: URL.createObjectURL(blob),
    blob,
    extension: "webm",
    mimeType: "video/webm",
    style,
    durationSec: totalSec,
    sizeBytes: blob.size,
  };
}

export function pickSupportedVideoMimeType(): {
  mimeType: string;
  extension: "mp4" | "webm";
} {
  const candidates: Array<{ mimeType: string; extension: "mp4" | "webm" }> = [
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

async function encodeViaMediaRecorder(options: {
  style: AnimationStyle;
  scenes: SceneItem[];
  timings: TimedLine[];
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<GeneratedVideoArtifact> {
  const { style, scenes, timings, onProgress, signal } = options;
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser does not support video encoding (WebCodecs or MediaRecorder).");
  }

  const totalSec = 30;
  const width = 1280;
  const height = 720;

  await waitForStyleBackdrop(style);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to initialize video canvas context.");
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AudioCtx();
  await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();

  const startAudioTime = audioCtx.currentTime + 0.1;
  for (const timing of timings) {
    if (timing.line.audioBase64) {
      try {
        const buffer = await decodeWavBase64(audioCtx, timing.line.audioBase64);
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        const slotDuration = Math.max(0.5, timing.endSec - timing.startSec);
        if (buffer.duration > slotDuration) {
          src.playbackRate.value = Math.min(1.35, buffer.duration / slotDuration);
        }
        src.connect(dest);
        src.start(startAudioTime + timing.startSec);
      } catch {
        // Skip malformed audio buffer
      }
    }
  }

  const videoStream = canvas.captureStream(24);
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const { mimeType, extension } = pickSupportedVideoMimeType();
  const recorder = mimeType
    ? new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 3_500_000,
      })
    : new MediaRecorder(combinedStream);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return await new Promise<GeneratedVideoArtifact>((resolve, reject) => {
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
          reject(new Error("Video generation cancelled."));
        },
        { once: true }
      );
    }

    recorder.onstop = () => {
      cleanup();
      if (signal?.aborted) return;
      const finalMime = mimeType || `video/${extension}`;
      const blob = new Blob(chunks, { type: finalMime });
      if (blob.size === 0) {
        reject(new Error("Generated video file was empty."));
        return;
      }
      resolve({
        url: URL.createObjectURL(blob),
        blob,
        extension,
        mimeType: finalMime,
        style,
        durationSec: totalSec,
        sizeBytes: blob.size,
      });
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
      onProgress(Math.round((clamped / totalSec) * 100));

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

/**
 * Generates and stores a complete 30-second playable & downloadable video file
 * combining all 4 scenes, English voices, and white bold bottom subtitles.
 * Uses fast WebCodecs (MP4/WebM) when supported, with automatic MediaRecorder fallback.
 */
export async function buildCompositeVideo(options: {
  style: AnimationStyle;
  scenes: SceneItem[];
  timings: TimedLine[];
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<GeneratedVideoArtifact> {
  const targetSpec = await detectWebCodecsTarget();
  if (targetSpec) {
    try {
      return await encodeViaWebCodecs({ ...options, targetSpec });
    } catch (err) {
      if (options.signal?.aborted) throw err;
      // Fallback to MediaRecorder if hardware/software WebCodecs throws at runtime
      return await encodeViaMediaRecorder(options);
    }
  }
  return await encodeViaMediaRecorder(options);
}
