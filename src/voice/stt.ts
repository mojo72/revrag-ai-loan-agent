// Speech-to-text. Primary: Deepgram live streaming (raw PCM over WebSocket, short-lived token).
// Fallback: the browser's Web Speech API when Deepgram is unavailable.

export interface SttCallbacks {
  onInterim: (text: string) => void;
  onUtterance: (text: string) => void;
  onSpeechStart?: () => void;
  onError: (message: string) => void;
}

export interface Stt {
  readonly provider: 'deepgram' | 'browser';
  start(): Promise<void>;
  stop(): void;
}

// AudioWorklet that forwards mic frames to the main thread.
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('tap', Tap);
`;

function floatTo16(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

export class DeepgramStt implements Stt {
  readonly provider = 'deepgram' as const;
  private ws?: WebSocket;
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private node?: AudioWorkletNode;
  private active = false;
  private finals: string[] = [];
  private keepAlive?: number;
  private cb: SttCallbacks;

  constructor(cb: SttCallbacks) {
    this.cb = cb;
  }

  async start() {
    this.active = true;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'tap');
    // Batch ~100ms of audio per WebSocket frame.
    let buf: Float32Array[] = [];
    let len = 0;
    const target = Math.round(this.ctx.sampleRate / 10);
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      buf.push(e.data);
      len += e.data.length;
      if (len < target) return;
      const merged = new Float32Array(len);
      let o = 0;
      for (const b of buf) merged.set(b, (o += b.length) - b.length);
      buf = [];
      len = 0;
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(floatTo16(merged));
    };
    src.connect(this.node);
    await this.connect();
  }

  private async connect() {
    const res = await fetch('/api/stt-token');
    if (!res.ok) throw new Error('Could not get a speech token');
    const { token, model, language } = (await res.json()) as { token: string; model?: string; language?: string };
    const params = new URLSearchParams({
      model: model ?? 'nova-3',
      language: language ?? 'en-IN',
      encoding: 'linear16',
      sample_rate: String(this.ctx!.sampleRate),
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      numerals: 'true',
      endpointing: '500',
      utterance_end_ms: '1300',
      vad_events: 'true',
    });
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ['bearer', token]);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Speech service connection failed'));
    });
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data as string));
    ws.onclose = () => {
      if (this.ws === ws && this.active) setTimeout(() => this.active && this.connect().catch((err) => this.cb.onError(String(err))), 500);
    };
    clearInterval(this.keepAlive);
    this.keepAlive = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'KeepAlive' })), 8000);
  }

  private flush() {
    const text = this.finals.join(' ').trim();
    this.finals = [];
    if (text) this.cb.onUtterance(text);
  }

  private onMessage(msg: { type: string; is_final?: boolean; speech_final?: boolean; channel?: { alternatives: { transcript: string }[] } }) {
    if (msg.type === 'SpeechStarted') return this.cb.onSpeechStart?.();
    if (msg.type === 'UtteranceEnd') return this.flush();
    if (msg.type !== 'Results') return;
    const t = msg.channel?.alternatives[0]?.transcript ?? '';
    if (msg.is_final) {
      if (t) this.finals.push(t);
      if (msg.speech_final) this.flush();
      else this.cb.onInterim(this.finals.join(' '));
    } else if (t) {
      this.cb.onInterim([...this.finals, t].join(' '));
    }
  }

  stop() {
    this.active = false;
    clearInterval(this.keepAlive);
    try {
      this.ws?.send(JSON.stringify({ type: 'CloseStream' }));
    } catch {
      /* already closed */
    }
    this.ws?.close();
    this.node?.disconnect();
    this.ctx?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ws = undefined;
  }
}

type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
  start(): void;
  stop(): void;
};

export function browserSttSupported() {
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export class BrowserStt implements Stt {
  readonly provider = 'browser' as const;
  private rec?: InstanceType<SpeechRecognitionCtor>;
  private active = false;
  private cb: SttCallbacks;

  constructor(cb: SttCallbacks) {
    this.cb = cb;
  }

  async start() {
    const w = window as unknown as Record<string, SpeechRecognitionCtor>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) throw new Error('Speech recognition is not supported in this browser. Use Chrome, or type instead.');
    this.active = true;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-IN';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.cb.onUtterance(r[0].transcript.trim());
        else interim += r[0].transcript;
      }
      if (interim) this.cb.onInterim(interim);
    };
    rec.onerror = (e) => e.error !== 'no-speech' && e.error !== 'aborted' && this.cb.onError(`Speech recognition error: ${e.error}`);
    rec.onend = () => this.active && rec.start();
    rec.start();
    this.rec = rec;
  }

  stop() {
    this.active = false;
    this.rec?.stop();
  }
}
