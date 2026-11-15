import type { Channel, SidechainConnection } from "@/shared/types";

/**
 * Per-track audio graph:
 *
 *   voices ─▶ input ─▶ base ─▶ duck ─▶ master
 *                        │
 *                        └▶ analyser ─▶ silent sink ─▶ master
 *
 * `base` carries the manual fader and mute, so the detector (which taps
 * `base`) follows the real post-fader signal: live playing, muting and fader
 * moves all change what the sidechain hears. `duck` is the automated gain and
 * preserves the manual fader as the base level underneath the ducking.
 */
type ChannelGraph = {
  input: GainNode;
  base: GainNode;
  duck: GainNode;
  analyser: AnalyserNode;
  sink: GainNode;
  samples: Float32Array<ArrayBuffer>;
};

type Envelope = {
  active: boolean;
  open: boolean;
  env: number;
  sourceId: string;
  targetId: string;
  depth: number;
  attack: number;
  release: number;
  threshold: number;
};

const TICK_MS = 12;
const SILENCE_FLOOR = 1e-7;
const HYSTERESIS_DB = 2;

export function createBuses() {
  let ctx: AudioContext | null = null,
    master: GainNode | null = null;
  const channels = new Map<string, ChannelGraph>();
  const envelopes = new Map<string, Envelope>();
  let timer: number | null = null;
  let lastTick = 0;
  /** Set while transport is paused/stopped: ducking must release smoothly. */
  let forceRelease = false;

  const hold = (param: AudioParam, at: number) => {
    if (typeof param.cancelAndHoldAtTime === "function")
      param.cancelAndHoldAtTime(at);
    else {
      const current = param.value;
      param.cancelScheduledValues(at);
      param.setValueAtTime(current, at);
    }
  };
  const glide = (param: AudioParam, value: number, at: number, seconds: number) => {
    hold(param, at);
    param.linearRampToValueAtTime(value, at + seconds);
  };

  const measure = (graph: ChannelGraph) => {
    graph.analyser.getFloatTimeDomainData(graph.samples);
    let sum = 0;
    for (const sample of graph.samples) sum += sample * sample;
    const rms = Math.sqrt(sum / graph.samples.length);
    return 20 * Math.log10(rms + SILENCE_FLOOR);
  };

  const tick = () => {
    if (!ctx || !master) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTick) / 1000));
    lastTick = now;
    for (const [id, state] of envelopes) {
      let desired = 1;
      if (state.active && !forceRelease) {
        const graph = channels.get(state.sourceId);
        if (graph) {
          const db = measure(graph);
          if (state.open) {
            if (db <= state.threshold - HYSTERESIS_DB) state.open = false;
          } else if (db >= state.threshold) {
            state.open = true;
          }
          desired = state.open ? Math.max(0, 1 - state.depth) : 1;
        }
      } else {
        state.open = false;
      }
      // `depth` is the fraction of level removed at full duck; the envelope
      // travels ~95% of the way in the configured attack/release time.
      const time = desired < state.env ? state.attack : state.release;
      const tau = Math.max(0.002, time / 1000 / 3);
      const k = 1 - Math.exp(-dt / tau);
      state.env += (desired - state.env) * k;
      if (!state.active && state.env > 0.999) envelopes.delete(id);
    }
    const combined = new Map<string, number>();
    for (const state of envelopes.values())
      if (state.env < 0.9995)
        combined.set(
          state.targetId,
          (combined.get(state.targetId) ?? 1) * state.env,
        );
    const at = ctx.currentTime;
    for (const [id, graph] of channels) {
      const value = combined.get(id) ?? 1;
      if (Math.abs(graph.duck.gain.value - value) > 0.0008)
        glide(graph.duck.gain, value, at, 0.012);
    }
  };

  const startTicking = () => {
    if (timer !== null) return;
    lastTick = performance.now();
    timer = window.setInterval(tick, TICK_MS);
  };

  const drop = (graph: ChannelGraph) => {
    graph.input.disconnect();
    graph.base.disconnect();
    graph.duck.disconnect();
    graph.analyser.disconnect();
    graph.sink.disconnect();
  };

  return {
    attach(context: AudioContext) {
      if (ctx === context) return;
      if (ctx) this.dispose();
      ctx = context;
      master = context.createGain();
      master.connect(context.destination);
      lastTick = performance.now();
      startTicking();
    },
    sync(states: Readonly<Record<string, Channel>>, volume: number) {
      if (!ctx || !master) return;
      const at = ctx.currentTime;
      glide(master.gain, volume, at, 0.02);
      for (const [id, graph] of channels)
        if (!states[id]) {
          drop(graph);
          channels.delete(id);
        }
      for (const [id, state] of Object.entries(states)) {
        let graph = channels.get(id);
        if (!graph) {
          const input = ctx.createGain();
          const base = ctx.createGain();
          const duck = ctx.createGain();
          const analyser = ctx.createAnalyser();
          const sink = ctx.createGain();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.15;
          sink.gain.value = 0;
          input.connect(base);
          base.connect(duck);
          duck.connect(master);
          // Tapping through a silent sink keeps the analyser pulled even while
          // the channel is muted or otherwise silent, without adding audio.
          base.connect(analyser);
          analyser.connect(sink);
          sink.connect(master);
          graph = {
            input,
            base,
            duck,
            analyser,
            sink,
            samples: new Float32Array(analyser.fftSize),
          };
          channels.set(id, graph);
        }
        glide(graph.base.gain, state.muted ? 0 : state.volume, at, 0.02);
      }
    },
    /** Rebuild the detector set; removed links release instead of snapping. */
    syncConnections(connections: readonly SidechainConnection[]) {
      const live = new Set<string>();
      for (const link of connections) {
        live.add(link.id);
        const state = envelopes.get(link.id);
        if (state) {
          state.active = true;
          state.sourceId = link.sourceId;
          state.targetId = link.targetId;
          state.depth = link.depth;
          state.attack = link.attack;
          state.release = link.release;
          state.threshold = link.threshold;
        } else
          envelopes.set(link.id, {
            active: true,
            open: false,
            env: 1,
            sourceId: link.sourceId,
            targetId: link.targetId,
            depth: link.depth,
            attack: link.attack,
            release: link.release,
            threshold: link.threshold,
          });
      }
      for (const [id, state] of envelopes)
        if (!live.has(id)) {
          state.active = false;
          state.open = false;
        }
    },
    /** Current automated gain per target (1 = untouched). */
    ducking() {
      const result: Record<string, number> = {};
      for (const state of envelopes.values())
        result[state.targetId] =
          (result[state.targetId] ?? 1) * state.env;
      return result;
    },
    /** Smoothly return every target to its manual level. */
    release() {
      forceRelease = true;
      for (const state of envelopes.values()) state.open = false;
    },
    resume() {
      forceRelease = false;
    },
    channel(id: string) {
      const graph = channels.get(id);
      if (!graph) throw new Error("声道未初始化");
      return graph.input;
    },
    dispose() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      for (const graph of channels.values()) drop(graph);
      channels.clear();
      envelopes.clear();
      master?.disconnect();
      master = null;
      ctx = null;
      forceRelease = false;
    },
  };
}
