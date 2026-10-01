// Text-to-speech. Primary: Murf (via our /api/tts proxy). Text is split into sentences and all
// sentences are synthesised in parallel, so playback starts after the first short sentence is ready.
// Fallback: the browser's speechSynthesis.

type Clip = { text: string; audio: Promise<AudioBuffer | null> };

export function splitSentences(text: string): string[] {
  const parts = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [text];
  // Merge very short fragments so we don't make lots of tiny requests.
  const out: string[] = [];
  for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
    if (out.length && (out[out.length - 1].length < 25 || p.length < 12)) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}

export class Speaker {
  private ctx?: AudioContext;
  private source?: AudioBufferSourceNode;
  private queue: Clip[] = [];
  private playing = false;
  private murfOk: boolean;
  private generation = 0;
  private idleWaiters: (() => void)[] = [];
  onSpeakingChange: (speaking: boolean, text?: string) => void = () => {};
  /** Text currently being spoken, used to filter our own voice out of the mic (echo). */
  currentText = '';

  constructor(useMurf: boolean) {
    this.murfOk = useMurf;
  }

  setMurf(on: boolean) {
    this.murfOk = on;
  }

  /** Must be called from a user gesture once, so later programmatic playback is allowed. */
  unlock() {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
  }

  get speaking() {
    return this.playing;
  }

  speak(text: string) {
    for (const s of splitSentences(text)) this.queue.push({ text: s, audio: this.fetchAudio(s) });
    if (!this.playing) void this.drain(this.generation);
  }

  /** Resolves when everything queued so far has finished playing (or was stopped). */
  whenIdle(): Promise<void> {
    if (!this.playing && this.queue.length === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  stop() {
    this.generation++;
    this.queue = [];
    try {
      this.source?.stop();
    } catch {
      /* not started */
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.setPlaying(false);
  }

  private setPlaying(p: boolean, text = '') {
    this.playing = p;
    this.currentText = text;
    this.onSpeakingChange(p, text);
    if (!p) this.idleWaiters.splice(0).forEach((r) => r());
  }

  private async fetchAudio(text: string): Promise<AudioBuffer | null> {
    if (!this.murfOk || !this.ctx) return null;
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error(String(res.status));
      return await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      console.warn('Murf TTS failed, using browser voice', e);
      this.murfOk = false;
      return null;
    }
  }

  private async drain(gen: number) {
    while (this.queue.length && gen === this.generation) {
      const clip = this.queue.shift()!;
      this.setPlaying(true, clip.text);
      const buffer = await clip.audio;
      if (gen !== this.generation) return;
      if (buffer) await this.playBuffer(buffer);
      else await this.browserSay(clip.text);
    }
    if (gen === this.generation) this.setPlaying(false);
  }

  private playBuffer(buffer: AudioBuffer) {
    return new Promise<void>((resolve) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = buffer;
      src.connect(this.ctx!.destination);
      src.onended = () => resolve();
      this.source = src;
      src.start();
    });
  }

  private browserSay(text: string) {
    return new Promise<void>((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      u.voice = voices.find((v) => v.lang === 'en-IN' && /female|veena|isha|heera/i.test(v.name)) ?? voices.find((v) => v.lang === 'en-IN') ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
      u.rate = 1.03;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }
}
