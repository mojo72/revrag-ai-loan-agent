// The voice session with the RevRag agent.
//
// RevRag runs the conversation (speech recognition, reasoning and voice) on its own LiveKit-based
// infrastructure. We connect with a RevRag-issued token, play the agent's audio, show live transcripts,
// and run RevRag's Action Intelligence protocol on the data channel: we stream `ui_snapshot`s of the
// screen and execute the `mission`s the agent sends back (see snapshot.ts and missions.ts).

import { ConnectionState, Room, RoomEvent, Track, type Participant, type RemoteTrack, type TranscriptionSegment } from 'livekit-client';
import { create } from 'zustand';
import { bus } from '../state/bus';
import { MissionRunner, clearHighlight } from './missions';
import { REVRAG_API_KEY, REVRAG_BASE, appUserId } from './identity';
import { SnapshotBuilder, snapshotDigest, type UiSnapshotWire } from './snapshot';

export type CallStatus = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface TranscriptItem {
  id: string;
  role: 'user' | 'agent' | 'action' | 'event' | 'error';
  text: string;
  ok?: boolean;
  final?: boolean;
}

interface CallUi {
  status: CallStatus;
  panelOpen: boolean;
  micOn: boolean;
  acting: boolean;
  items: TranscriptItem[];
  stats: { snapshots: number; missions: number; steps: number };
}

export const useCall = create<CallUi>(() => ({
  status: 'off',
  panelOpen: false,
  micOn: false,
  acting: false,
  items: [],
  stats: { snapshots: 0, missions: 0, steps: 0 },
}));

let seq = 0;
function push(role: TranscriptItem['role'], text: string, ok?: boolean) {
  useCall.setState((s) => {
    const last = s.items[s.items.length - 1];
    if (last && last.role === role && last.text === text && (role === 'error' || role === 'event')) return s;
    return { items: [...s.items, { id: `i${++seq}`, role, text, ok, final: true }].slice(-120) };
  });
}

/** Insert or update a streamed transcript segment. */
function upsertSegment(id: string, role: 'user' | 'agent', text: string, final: boolean) {
  useCall.setState((s) => {
    const i = s.items.findIndex((it) => it.id === id);
    if (i === -1) return { items: [...s.items, { id, role, text, final }].slice(-120) };
    const items = s.items.slice();
    items[i] = { ...items[i], text, final };
    return { items };
  });
}

/** LiveKit reliable data packets are capped well below 64 KB; keep each snapshot comfortably inside. */
const MAX_SNAPSHOT_BYTES = 14_000;

function fitToBudget(w: UiSnapshotWire): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  let bytes = enc.encode(JSON.stringify(w));
  if (bytes.length <= MAX_SNAPSHOT_BYTES) return bytes;
  // Drop, in order: off-screen plain text, then all plain text, then off-screen controls.
  const passes: ((n: UiSnapshotWire['nodes'][number]) => boolean)[] = [
    (n) => !(n.role === 'text' && !n.visible),
    (n) => n.role !== 'text',
    (n) => n.visible || n.role === 'heading' || n.role === 'scroll_view',
  ];
  let nodes = w.nodes;
  for (const keep of passes) {
    nodes = nodes.filter(keep);
    const ids = new Set(nodes.map((n) => n.id));
    const slim: UiSnapshotWire = {
      ...w,
      nodes: nodes.map((n) => ({ ...n, tokens: undefined, subtree_text: n.role === 'dropdown' ? n.subtree_text : undefined })),
      paths: Object.fromEntries(Object.entries(w.paths).filter(([k]) => ids.has(k))),
      visible: nodes.flatMap((n, i) => (n.visible ? [i] : [])),
    };
    bytes = enc.encode(JSON.stringify(slim));
    if (bytes.length <= MAX_SNAPSHOT_BYTES) return bytes;
  }
  return bytes;
}

class RevragCall {
  private room?: Room;
  private runner: MissionRunner;
  private builder = new SnapshotBuilder();
  private lastDigest = '';
  private pushTimer?: number;
  private forcePending = false;
  private observer?: MutationObserver;
  private audioEls: HTMLMediaElement[] = [];
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private agentState = '';

  constructor() {
    this.runner = new MissionRunner({
      emit: (w) => this.send(w),
      afterStep: () => this.schedulePush(150),
      onAction: (summary, ok) => {
        push('action', summary, ok);
        bus.emit({ type: 'agent_action', tool: 'revrag_mission', summary });
        useCall.setState((s) => ({ stats: { ...s.stats, steps: s.stats.steps + 1 } }));
      },
      onActiveChange: (acting) => {
        useCall.setState({ acting });
        document.body.classList.toggle('ai-acting', acting);
      },
    });
  }

  get active() {
    return !!this.room && this.room.state !== ConnectionState.Disconnected;
  }

  /** Start a call. Must be called from a click so audio playback and the mic prompt are allowed. */
  async start() {
    if (this.active) return;
    useCall.setState({ panelOpen: true, status: 'connecting' });
    if (!REVRAG_API_KEY) {
      push('error', 'RevRag is not configured (VITE_REVRAG_API_KEY is missing).');
      useCall.setState({ status: 'off' });
      return;
    }
    try {
      const res = await fetch(`${REVRAG_BASE}/embedded-agent/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Revrag-Embedded-Key': REVRAG_API_KEY, 'X-Revrag-App-Version': '1.0.0' },
        body: JSON.stringify({ app_user_id: appUserId(), app_version: '1.0.0' }),
      });
      if (!res.ok) throw new Error(`RevRag token request failed (${res.status})`);
      const { server_url, token } = (await res.json()) as { server_url: string; token: string };

      const room = new Room({ audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.room = room;
      this.wire(room);
      await room.connect(server_url, token, { autoSubscribe: true });
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      useCall.setState({ micOn: true, status: 'listening' });
      push('event', 'Connected to Sara (RevRag agent).');
      this.watchScreen();
      this.schedulePush(0, true);
    } catch (e) {
      console.error(e);
      const denied = e instanceof DOMException && e.name === 'NotAllowedError';
      push('error', denied ? 'Microphone permission was denied. Allow the mic and try again, or type below.' : e instanceof Error ? e.message : String(e));
      if (!denied) await this.stop();
      else useCall.setState({ status: 'listening', micOn: false });
    }
  }

  async stop() {
    this.runner.cancelAll();
    clearHighlight();
    this.observer?.disconnect();
    removeEventListener('scroll', this.onScroll);
    clearTimeout(this.pushTimer);
    const room = this.room;
    this.room = undefined;
    this.audioEls.forEach((el) => el.remove());
    this.audioEls = [];
    this.lastDigest = '';
    await room?.disconnect().catch(() => undefined);
    document.body.classList.remove('ai-acting');
    useCall.setState({ status: 'off', micOn: false, acting: false });
  }

  async toggleMic() {
    if (!this.room) return;
    const on = !useCall.getState().micOn;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(on);
      useCall.setState({ micOn: on });
    } catch {
      push('error', 'Could not access the microphone.');
    }
  }

  /** Typed message into the call (LiveKit agents accept text on the `lk.chat` topic). */
  async sendText(text: string) {
    if (!text.trim()) return;
    if (!this.active) {
      push('event', 'Start a call with Sara first, then you can type or talk.');
      return;
    }
    push('user', text);
    this.schedulePush(0, true);
    try {
      await this.room!.localParticipant.sendText(text, { topic: 'lk.chat' });
    } catch {
      push('error', 'Could not send the message.');
    }
  }

  // ---------- wiring ----------

  private wire(room: Room) {
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.setAttribute('data-ai-ignore', '');
      document.body.appendChild(el);
      this.audioEls.push(el);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach((el) => el.remove()));

    room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(this.decoder.decode(payload));
      } catch {
        return;
      }
      if (json.type === 'request_ui_tree') return this.schedulePush(0, true);
      if (json.type === 'mission') useCall.setState((s) => ({ stats: { ...s.stats, missions: s.stats.missions + 1 } }));
      this.runner.handle(json);
    });

    // Agent state drives the orb; "thinking" means the customer just finished speaking, so give the
    // planner the freshest screen.
    room.on(RoomEvent.ParticipantAttributesChanged, (changed: Record<string, string>, p: Participant) => {
      const state = changed['lk.agent.state'] ?? p.attributes?.['lk.agent.state'];
      if (!state || p.isLocal) return;
      if (state === 'thinking' && this.agentState !== 'thinking') this.schedulePush(0, true);
      this.agentState = state;
      const map: Record<string, CallStatus> = { speaking: 'speaking', thinking: 'thinking', listening: 'listening', initializing: 'connecting' };
      if (map[state]) useCall.setState({ status: map[state] });
    });

    room.on(RoomEvent.ParticipantConnected, () => this.schedulePush(300, true));

    room.on(RoomEvent.TranscriptionReceived, (segments: TranscriptionSegment[], p?: Participant) => {
      const role = p?.isLocal ? 'user' : 'agent';
      for (const s of segments) if (s.text.trim()) upsertSegment(`t_${s.id}`, role, s.text, s.final);
    });
    // Newer LiveKit agents publish transcripts as text streams instead.
    try {
      room.registerTextStreamHandler('lk.transcription', async (reader, info) => {
        const role = info.identity === room.localParticipant.identity ? 'user' : 'agent';
        const id = `s_${reader.info.id}`;
        let text = '';
        for await (const chunk of reader) {
          text += chunk;
          upsertSegment(id, role, text, false);
        }
        upsertSegment(id, role, text, true);
      });
    } catch {
      /* handler already registered */
    }

    room.on(RoomEvent.Disconnected, () => {
      if (this.room === room) {
        push('event', 'Call ended.');
        void this.stop();
      }
    });
  }

  private send(w: Record<string, unknown>) {
    const room = this.room;
    if (!room || room.state !== ConnectionState.Connected) return;
    room.localParticipant.publishData(this.encoder.encode(JSON.stringify(w)), { reliable: true }).catch((e) => console.warn('[RevRag] publish failed', e));
  }

  // ---------- snapshot pump ----------

  private onScroll = () => this.schedulePush(600);

  private watchScreen() {
    const root = document.getElementById('root')!;
    this.observer = new MutationObserver(() => this.schedulePush(400));
    this.observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['value', 'aria-checked', 'class'] });
    addEventListener('scroll', this.onScroll, { passive: true });
  }

  /** Debounced, de-duplicated `ui_snapshot` push. `force` bypasses de-dup (baseline, speech end, pulls). */
  schedulePush(delay = 400, force = false) {
    if (!this.room) return;
    this.forcePending ||= force;
    clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => {
      const room = this.room;
      if (!room || room.state !== ConnectionState.Connected) return;
      const forced = this.forcePending;
      this.forcePending = false;
      const { wire } = this.builder.capture();
      const digest = snapshotDigest(wire);
      if (!forced && digest === this.lastDigest) return;
      this.lastDigest = digest;
      room.localParticipant.publishData(fitToBudget(wire), { reliable: true }).catch(() => undefined);
      useCall.setState((s) => ({ stats: { ...s.stats, snapshots: s.stats.snapshots + 1 } }));
    }, delay);
  }
}

export const call = new RevragCall();
