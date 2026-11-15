import type { Channel, Track } from "@/shared/types";
import { decibels, ducked } from "../lib/levels";
export function ChannelStrip({
  track,
  channel,
  volume,
  mute,
  running,
  duckGain = 1,
  duckedBy,
  triggers,
}: {
  track: Track;
  channel: Channel;
  volume: (n: number) => void;
  mute: () => void;
  running: boolean;
  /** Automated gain from incoming sidechains (1 = untouched). */
  duckGain?: number;
  /** Name of the drum track currently ducking this one, if any. */
  duckedBy?: string;
  /** Names of tracks this channel is currently ducking. */
  triggers?: readonly string[];
}) {
  const base = channel.muted ? 0 : channel.volume;
  const active = base * duckGain;
  return (
    <div className={`channel-strip ${channel.muted ? "muted" : ""}`}>
      <div className="strip-head">
        <span className="color-dot" style={{ background: track.color }} />
        <strong>{track.name}</strong>
        <button
          onClick={mute}
          aria-label={`${channel.muted ? "取消静音" : "静音"} ${track.name}`}
          aria-pressed={channel.muted}
        >
          M
        </button>
      </div>
      {duckedBy && (
        <div className="strip-sidechain">
          <span>◤ 闪避自 {duckedBy}</span>
        </div>
      )}
      {!!triggers?.length && (
        <div className="strip-sidechain source">
          <span>◢ 触发 {triggers.join("、")}</span>
        </div>
      )}
      <div className="fader-line">
        <input
          aria-label={`${track.name} 音量`}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={channel.volume}
          onChange={(e) => volume(Number(e.target.value))}
        />
        <span>{decibels(base)}</span>
      </div>
      {duckGain < 0.995 && (
        <div className="duck-readout">
          <span>基础 {decibels(base)}</span>
          <span className="ducked">压低 {ducked(duckGain)}</span>
          <span>当前 {decibels(active)}</span>
        </div>
      )}
      <div className="level-track">
        <i
          style={{
            width: `${running ? active * 100 : 0}%`,
            background: track.color,
          }}
        />
        {duckGain < 0.995 && (
          <em
            style={{
              width: `${running ? (base - active) * 100 : 0}%`,
              background: track.color,
            }}
          />
        )}
      </div>
    </div>
  );
}
