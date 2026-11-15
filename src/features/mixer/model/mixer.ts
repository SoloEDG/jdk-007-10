import type {
  Channel,
  SidechainConnection,
  SidechainSettings,
} from "@/shared/types";
import { level } from "../lib/levels";
import { sidechainLink, sidechainSettings } from "../lib/sidechain";
import { createBuses } from "./buses";
export function createMixer() {
  let channels: Record<string, Channel> = {},
    master = 0.75,
    links: SidechainConnection[] = [];
  const buses = createBuses();
  const sync = () => buses.sync(channels, master);
  const syncLinks = () => buses.syncConnections(links);
  return {
    snapshot() {
      return {
        channels: structuredClone(channels),
        master,
        sidechains: structuredClone(links),
        ducking: buses.ducking(),
      };
    },
    restore(
      next: Record<string, Channel>,
      volume: number,
      sidechains: readonly SidechainConnection[] = [],
    ) {
      channels = structuredClone(next);
      master = level(volume);
      links = structuredClone([...sidechains]);
      sync();
      syncLinks();
    },
    ensure(ids: string[]) {
      channels = Object.fromEntries(
        ids.map((id) => [id, channels[id] ?? { volume: 0.75, muted: false }]),
      );
      links = links.filter(
        (l) => ids.includes(l.sourceId) && ids.includes(l.targetId),
      );
      sync();
      syncLinks();
    },
    volume(id: string, value: number) {
      if (channels[id])
        channels[id] = { ...channels[id], volume: level(value) };
      sync();
    },
    mute(id: string) {
      if (channels[id])
        channels[id] = { ...channels[id], muted: !channels[id].muted };
      sync();
    },
    master(value: number) {
      master = level(value);
      sync();
    },
    /**
     * Validate and store a new link. Throws with an explanation for illegal
     * connections; the existing graph is left untouched on failure.
     */
    connect(
      sourceId: string,
      targetId: string,
      tracks: Parameters<typeof sidechainLink>[2],
      settings: Partial<SidechainSettings> = {},
    ) {
      const link = sidechainLink(sourceId, targetId, tracks, links, settings);
      links = [...links, link];
      syncLinks();
      return link;
    },
    update(id: string, settings: Partial<SidechainSettings>) {
      const link = links.find((l) => l.id === id);
      if (!link) throw new Error("侧链连接已不存在");
      const next = sidechainSettings({ ...link, ...settings });
      links = links.map((l) => (l.id === id ? { ...l, ...next } : l));
      syncLinks();
    },
    disconnect(id: string) {
      links = links.filter((l) => l.id !== id);
      syncLinks();
    },
    /** Drop links whose tracks vanished, releasing their ducking. */
    prune(trackIds: readonly string[]) {
      const before = links.length;
      links = links.filter(
        (l) => trackIds.includes(l.sourceId) && trackIds.includes(l.targetId),
      );
      syncLinks();
      return before - links.length;
    },
    /** Transport paused/stopped: release every ducked target smoothly. */
    release() {
      buses.release();
    },
    resume() {
      buses.resume();
    },
    attach(ctx: AudioContext) {
      buses.attach(ctx);
      sync();
      syncLinks();
    },
    channel: (id: string) => buses.channel(id),
    dispose: () => buses.dispose(),
  };
}
export type Mixer = ReturnType<typeof createMixer>;
