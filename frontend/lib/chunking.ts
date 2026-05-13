export type ChunkTiming = {
  chunkIndex: number;
  chunkId: string;
  t0: number;
  t1: number;
};

export const formatChunkId = (chunkIndex: number): string => {
  return `c_${String(chunkIndex + 1).padStart(3, "0")}`;
};

export const getChunkTimingByIndex = (
  chunkIndex: number,
  chunkMs: number
): ChunkTiming => {
  const t0 = chunkIndex * chunkMs;

  return {
    chunkIndex,
    chunkId: formatChunkId(chunkIndex),
    t0,
    t1: t0 + chunkMs,
  };
};

export const getCompletedChunkTiming = (
  nowMs: number,
  turnStartedAtMs: number,
  chunkMs: number
): ChunkTiming | null => {
  const elapsedMs = nowMs - turnStartedAtMs;

  if (!Number.isFinite(elapsedMs) || elapsedMs < chunkMs) {
    return null;
  }

  const completedChunkIndex = Math.floor(elapsedMs / chunkMs) - 1;

  return getChunkTimingByIndex(completedChunkIndex, chunkMs);
};
