export type Instrument = "drums" | "keys";
export type Note = {
  id: string;
  pitch: number;
  beat: number;
  duration: number;
  velocity: number;
};
export type Track = {
  id: string;
  name: string;
  instrument: Instrument;
  color: string;
  notes: Note[];
};
export type Channel = { volume: number; muted: boolean };
/**
 * A sidechain connection lets one track's live signal duck another track.
 * `sourceId` must be a drum track, `targetId` a keys track. All times are ms,
 * `threshold` is dBFS and `depth` is the attenuation at full duck (0..1).
 */
export type SidechainConnection = {
  id: string;
  sourceId: string;
  targetId: string;
  depth: number;
  attack: number;
  release: number;
  threshold: number;
};
export type SidechainSettings = Pick<
  SidechainConnection,
  "depth" | "attack" | "release" | "threshold"
>;
export type Session = {
  version: 1;
  title: string;
  bpm: number;
  beats: number;
  tracks: Track[];
  channels: Record<string, Channel>;
  master: number;
  /** Omitted by older sessions; absent means no sidechain (dry original mix). */
  sidechains?: SidechainConnection[];
};
export type NoteInput = {
  pitch: number;
  velocity: number;
  instrument: Instrument;
};
export type ScheduledNote = NoteInput & {
  duration: number;
  when: number;
  trackId: string;
};
export type Listener = () => void;
