import type {
  SidechainConnection,
  SidechainSettings,
  Track,
} from "@/shared/types";

export const SIDECHAIN_MAX = 32;
export const SIDECHAIN_DEFAULTS: SidechainSettings = {
  depth: 0.7,
  attack: 15,
  release: 320,
  threshold: -30,
};
export const SIDECHAIN_RANGES = {
  depth: [0.1, 1] as const,
  attack: [5, 500] as const,
  release: [30, 2000] as const,
  threshold: [-60, -6] as const,
};

type Link = { sourceId: string; targetId: string };

const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

const within = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

const label = {
  depth: "深度",
  attack: "压缩时间",
  release: "释放时间",
  threshold: "门限",
};

/** Clamp a user-supplied setting into the supported range. */
export function sidechainSettings(
  value: Partial<SidechainSettings>,
): SidechainSettings {
  if (!object(value)) throw new Error("侧链参数格式无效");
  const result = { ...SIDECHAIN_DEFAULTS };
  for (const key of Object.keys(SIDECHAIN_DEFAULTS) as (keyof SidechainSettings)[]) {
    if (value[key] === undefined) continue;
    const [min, max] = SIDECHAIN_RANGES[key];
    if (!within(value[key], min, max))
      throw new Error(`${label[key]}必须在 ${min} 到 ${max} 之间`);
    result[key] = Number(value[key]);
  }
  return result;
}

function assertTrack(
  id: unknown,
  tracks: readonly Track[],
  role: "源" | "目标",
): Track {
  if (typeof id !== "string" || !id)
    throw new Error(`侧链${role}轨道无效`);
  const track = tracks.find((t) => t.id === id);
  if (!track) throw new Error(`侧链${role}轨道已不存在，请重新选择`);
  return track;
}

function assertLink(
  link: Link,
  tracks: readonly Track[],
  connections: readonly SidechainConnection[],
  incomingId?: unknown,
) {
  const source = assertTrack(link.sourceId, tracks, "源");
  const target = assertTrack(link.targetId, tracks, "目标");
  if (source.id === target.id)
    throw new Error("侧链不能触发自己：源轨与目标轨必须是不同的轨道");
  if (source.instrument !== "drums")
    throw new Error(
      `侧链源“${source.name}”不是鼓组轨道；只有鼓点能作为侧链触发信号`,
    );
  if (target.instrument !== "keys")
    throw new Error(
      `侧链目标“${target.name}”不是琴键轨道；请选择一条琴键轨作为被压低轨道`,
    );
  if (
    incomingId !== undefined &&
    (!incomingId || typeof incomingId !== "string" || incomingId.length > 64)
  )
    throw new Error("侧链连接编号无效");
  if (
    connections.some(
      (c) =>
        c.sourceId === source.id &&
        c.targetId === target.id &&
        c.id !== incomingId,
    )
  )
    throw new Error(
      `“${source.name}”到“${target.name}”已经有一条侧链连接，请直接调整它的参数`,
    );
  if (reaches(connections, target.id, source.id))
    throw new Error(
      `这条侧链会形成循环依赖：${target.name} 已经（间接）影响 ${source.name}，请换一个目标`,
    );
}

function reaches(
  connections: readonly SidechainConnection[],
  from: string,
  to: string,
) {
  const queue = [from];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const c of connections)
      if (c.sourceId === current) queue.push(c.targetId);
  }
  return false;
}

/** Validate a new sidechain link without touching the existing graph. */
export function sidechainLink(
  sourceId: string,
  targetId: string,
  tracks: readonly Track[],
  connections: readonly SidechainConnection[],
  settings: Partial<SidechainSettings> = {},
): SidechainConnection {
  assertLink({ sourceId, targetId }, tracks, connections);
  if (connections.length >= SIDECHAIN_MAX)
    throw new Error(`最多支持 ${SIDECHAIN_MAX} 组侧链连接，请先移除一组`);
  return {
    id: crypto.randomUUID(),
    sourceId,
    targetId,
    ...sidechainSettings(settings),
  };
}

/** Full validation used when rebuilding a saved graph. */
export function sidechainConnections(
  raw: unknown,
  tracks: readonly Track[],
): SidechainConnection[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > SIDECHAIN_MAX)
    throw new Error("侧链数据格式无效或连接过多");
  const result: SidechainConnection[] = [];
  for (const value of raw) {
    if (!object(value)) throw new Error("侧链连接数据无效");
    const id = value.id;
    if (typeof id !== "string" || !id || id.length > 64)
      throw new Error("侧链连接编号无效");
    if (result.some((c) => c.id === id))
      throw new Error("侧链连接编号重复");
    const link = {
      sourceId: value.sourceId as string,
      targetId: value.targetId as string,
    };
    assertLink(link, tracks, result, id);
    result.push({
      id,
      ...link,
      ...sidechainSettings(value as Partial<SidechainSettings>),
    });
  }
  return result;
}
