export const MAX_SECONDS = 28;
export const MIN_SECONDS = 1.2;
const TARGET_RATE = 16000;

export class TooShortError extends Error {}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export async function blobToWav16k(blob: Blob): Promise<{ wav: Blob; duration: number }> {
  const arr = await blob.arrayBuffer();
  const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arr);
  } finally {
    void ctx.close();
  }
  const duration = decoded.duration;
  if (duration < MIN_SECONDS) throw new TooShortError();
  const length = Math.max(1, Math.ceil(duration * TARGET_RATE));
  const off = new OfflineAudioContext(1, length, TARGET_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded; // multi-channel is down-mixed to mono by the 1-channel destination
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return { wav: encodeWav(rendered.getChannelData(0), TARGET_RATE), duration };
}

export class Recorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private chunks: Blob[] = [];
  private timer: number | undefined;
  startedAt = 0;
  level = 0;

  async start(onAutoStop: () => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    src.connect(this.analyser);
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(250);
    this.startedAt = performance.now();
    this.timer = window.setTimeout(onAutoStop, MAX_SECONDS * 1000);
  }

  /** Smoothed RMS 0..1; call every frame. */
  getLevel(): number {
    if (!this.analyser || !this.data) return 0;
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const x = (this.data[i] - 128) / 128;
      sum += x * x;
    }
    const rms = Math.min(1, Math.sqrt(sum / this.data.length) * 4);
    this.level += (rms - this.level) * 0.25;
    return this.level;
  }

  elapsed(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  async stop(): Promise<Blob> {
    window.clearTimeout(this.timer);
    const rec = this.rec;
    const done = new Promise<Blob>((resolve) => {
      if (!rec || rec.state === 'inactive') return resolve(new Blob(this.chunks));
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType }));
      rec.stop();
    });
    const blob = await done;
    this.cleanup();
    return blob;
  }

  cancel() {
    window.clearTimeout(this.timer);
    try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); } catch { /* ignore */ }
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.stream = null; this.ctx = null; this.analyser = null; this.rec = null; this.level = 0;
  }
}

export async function downscaleImage(file: Blob, maxEdge = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.8));
}
