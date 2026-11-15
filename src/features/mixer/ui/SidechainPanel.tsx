import { useState } from "react";
import type { Track, SidechainConnection, SidechainSettings } from "@/shared/types";
import { decibels, ducked } from "../lib/levels";
import { SIDECHAIN_RANGES } from "../lib/sidechain";

const depthLabel = (n: number) => `−${Math.round(-20 * Math.log10(1 - n))} dB`;
const thresholdLabel = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n)} dBFS`;

function Slider({
  name,
  label,
  value,
  min,
  max,
  step,
  format,
  change,
}: {
  name: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  change: (n: number) => void;
}) {
  return (
    <label className="sidechain-slider">
      <span>{label}</span>
      <input
        aria-label={`${name} ${label}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
      />
      <b>{format(value)}</b>
    </label>
  );
}

export function SidechainPanel({
  tracks,
  connections,
  channels,
  ducking,
  connect,
  update,
  disconnect,
}: {
  tracks: readonly Track[];
  connections: readonly SidechainConnection[];
  channels: Record<string, { volume: number; muted: boolean }>;
  ducking: Record<string, number>;
  connect: (sourceId: string, targetId: string) => void;
  update: (id: string, settings: Partial<SidechainSettings>) => void;
  disconnect: (id: string) => void;
}) {
  const sources = tracks.filter((t) => t.instrument === "drums");
  const targets = tracks.filter((t) => t.instrument === "keys");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const name = (id: string) => tracks.find((t) => t.id === id)?.name ?? "已移除";
  const available = sources.length > 0 && targets.length > 0;
  const chosenSource = sources.some((t) => t.id === source)
    ? source
    : (sources[0]?.id ?? "");
  const chosenTarget = targets.some((t) => t.id === target)
    ? target
    : (targets[0]?.id ?? "");

  return (
    <div className="sidechain">
      <div className="sidechain-head">
        <strong>侧链闪避</strong>
        <span>{connections.length} / 32 组</span>
      </div>
      {connections.length === 0 ? (
        <p className="sidechain-empty">
          鼓点出现时自动压低琴键轨。源轨与目标轨都跟随实际声道。
        </p>
      ) : (
        connections.map((c) => {
          const targetChannel = channels[c.targetId];
          const gain = ducking[c.targetId] ?? 1;
          const base = targetChannel?.muted ? 0 : (targetChannel?.volume ?? 0);
          return (
            <div className="sidechain-link" key={c.id}>
              <div className="sidechain-route">
                <span>{name(c.sourceId)}</span>
                <i>→</i>
                <strong>{name(c.targetId)}</strong>
                <button
                  className="sidechain-remove"
                  aria-label={`移除侧链 ${name(c.sourceId)} → ${name(c.targetId)}`}
                  onClick={() => disconnect(c.id)}
                >
                  ×
                </button>
              </div>
              <div className="sidechain-readout">
                <span>基础 {decibels(base)}</span>
                <span className={gain < 0.995 ? "ducked" : ""}>
                  压低 {ducked(gain)}
                </span>
              </div>
              <Slider
                name={`${name(c.sourceId)} → ${name(c.targetId)}`}
                label="深度"
                value={c.depth}
                min={SIDECHAIN_RANGES.depth[0]}
                max={SIDECHAIN_RANGES.depth[1]}
                step={0.01}
                format={depthLabel}
                change={(n) => update(c.id, { depth: n })}
              />
              <Slider
                name={`${name(c.sourceId)} → ${name(c.targetId)}`}
                label="起音"
                value={c.attack}
                min={SIDECHAIN_RANGES.attack[0]}
                max={SIDECHAIN_RANGES.attack[1]}
                step={1}
                format={(n) => `${n} ms`}
                change={(n) => update(c.id, { attack: n })}
              />
              <Slider
                name={`${name(c.sourceId)} → ${name(c.targetId)}`}
                label="释放"
                value={c.release}
                min={SIDECHAIN_RANGES.release[0]}
                max={SIDECHAIN_RANGES.release[1]}
                step={10}
                format={(n) => `${n} ms`}
                change={(n) => update(c.id, { release: n })}
              />
              <Slider
                name={`${name(c.sourceId)} → ${name(c.targetId)}`}
                label="门限"
                value={c.threshold}
                min={SIDECHAIN_RANGES.threshold[0]}
                max={SIDECHAIN_RANGES.threshold[1]}
                step={1}
                format={thresholdLabel}
                change={(n) => update(c.id, { threshold: n })}
              />
            </div>
          );
        })
      )}
      {!available ? (
        <p className="sidechain-empty">
          需要同时存在鼓组轨（源）和琴键轨（目标）才能建立侧链。
        </p>
      ) : (
        <div className="sidechain-new">
          <select
            aria-label="侧链源鼓轨"
            value={chosenSource}
            onChange={(e) => setSource(e.target.value)}
          >
            {sources.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · 鼓
              </option>
            ))}
          </select>
          <span>→</span>
          <select
            aria-label="侧链目标琴键轨"
            value={chosenTarget}
            onChange={(e) => setTarget(e.target.value)}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · 琴键
              </option>
            ))}
          </select>
          <button onClick={() => connect(chosenSource, chosenTarget)}>
            ＋ 建立侧链
          </button>
        </div>
      )}
      <small className="sidechain-note">
        源轨取实际声道电平：现场演奏、静音与推子都会影响检测。移动被压低轨的
        推子只改变基础音量，压低量另行显示。
      </small>
    </div>
  );
}
