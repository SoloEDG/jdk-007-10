import type {
  Track,
  Channel,
  SidechainConnection,
  SidechainSettings,
} from "@/shared/types";
import { ChannelStrip } from "./ChannelStrip";
import { SidechainPanel } from "./SidechainPanel";
export function MixerPanel({
  tracks,
  channels,
  master,
  running,
  ducking,
  sidechains,
  volume,
  mute,
  setMaster,
  connect,
  updateSidechain,
  disconnectSidechain,
}: {
  tracks: readonly Track[];
  channels: Record<string, Channel>;
  master: number;
  running: boolean;
  ducking: Record<string, number>;
  sidechains: readonly SidechainConnection[];
  volume: (id: string, n: number) => void;
  mute: (id: string) => void;
  setMaster: (n: number) => void;
  connect: (sourceId: string, targetId: string) => void;
  updateSidechain: (id: string, n: Partial<SidechainSettings>) => void;
  disconnectSidechain: (id: string) => void;
}) {
  const name = (id: string) =>
    tracks.find((t) => t.id === id)?.name ?? "已移除的轨道";
  const duckedBy = (id: string) => {
    const links = sidechains.filter(
      (c) => c.targetId === id && (ducking[id] ?? 1) < 0.995,
    );
    return links.length ? links.map((c) => name(c.sourceId)).join("、") : undefined;
  };
  const triggers = (id: string) =>
    sidechains
      .filter((c) => c.sourceId === id && (ducking[c.targetId] ?? 1) < 0.995)
      .map((c) => name(c.targetId));
  return (
    <section className="panel mixer-panel">
      <div className="section-heading">
        <div>
          <small>03 / BALANCE</small>
          <h2>混音台</h2>
        </div>
        <span className="tag">LIVE BUS</span>
      </div>
      {tracks.length === 0 ? (
        <p className="empty-small">添加轨道后，在这里平衡每一种声音。</p>
      ) : (
        tracks.map((t) => (
          <ChannelStrip
            key={t.id}
            track={t}
            channel={channels[t.id] ?? { volume: 0.75, muted: false }}
            running={running}
            duckGain={ducking[t.id] ?? 1}
            duckedBy={duckedBy(t.id)}
            triggers={triggers(t.id)}
            volume={(n) => volume(t.id, n)}
            mute={() => mute(t.id)}
          />
        ))
      )}
      <SidechainPanel
        tracks={tracks}
        connections={sidechains}
        channels={channels}
        ducking={ducking}
        connect={connect}
        update={updateSidechain}
        disconnect={disconnectSidechain}
      />
      <div className="master">
        <div>
          <strong>主输出</strong>
          <span>{Math.round(master * 100)}%</span>
        </div>
        <input
          aria-label="主音量"
          type="range"
          min="0"
          max="1"
          step=".01"
          value={master}
          onChange={(e) => setMaster(Number(e.target.value))}
        />
        <small>电平条为设定值 · 声音由本机实时合成</small>
      </div>
    </section>
  );
}
