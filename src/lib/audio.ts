/**
 * Browser-side audio prep: decode any audio/video file to 16 kHz mono, then cut it into
 * WAV chunks at quiet moments. 16 kHz mono is what Whisper uses internally, and ~110 s
 * chunks stay under Vercel's 4.5 MB request body limit when proxied.
 */

export const SAMPLE_RATE = 16000;
const TARGET_CHUNK = 110;
const MAX_CHUNK = 120;

export type AudioChunk = { blob: Blob; offset: number; duration: number };

export async function decodeToMono(file: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
    const out = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < data.length; i++) out[i] += data[i] / buf.numberOfChannels;
    }
    return out;
  } catch {
    throw new Error("Couldn't read audio from this file. Try an MP3, M4A, WAV, MP4 or WebM.");
  } finally {
    void ctx.close();
  }
}

/** Finds the quietest 200 ms window between `from` and `to` seconds. */
function quietestPoint(pcm: Float32Array, from: number, to: number) {
  const win = Math.floor(SAMPLE_RATE * 0.2);
  let best = Math.floor(to * SAMPLE_RATE);
  let bestEnergy = Infinity;
  for (let i = Math.floor(from * SAMPLE_RATE); i + win < Math.min(pcm.length, to * SAMPLE_RATE); i += win / 2) {
    let e = 0;
    for (let j = i; j < i + win; j += 4) e += pcm[j] * pcm[j];
    if (e < bestEnergy) {
      bestEnergy = e;
      best = i + win / 2;
    }
  }
  return best;
}

export function splitIntoChunks(pcm: Float32Array): AudioChunk[] {
  const chunks: AudioChunk[] = [];
  let start = 0;
  while (start < pcm.length) {
    const remaining = (pcm.length - start) / SAMPLE_RATE;
    const end =
      remaining <= MAX_CHUNK
        ? pcm.length
        : quietestPoint(pcm, start / SAMPLE_RATE + TARGET_CHUNK - 15, start / SAMPLE_RATE + MAX_CHUNK);
    const slice = pcm.subarray(start, end);
    chunks.push({ blob: encodeWav(slice), offset: start / SAMPLE_RATE, duration: slice.length / SAMPLE_RATE });
    start = end;
  }
  return chunks;
}

export function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
