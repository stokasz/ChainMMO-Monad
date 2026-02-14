const MAX_SET_ID = 255;

export function toSetMaskBigInt(setMask: string | bigint): bigint {
  const mask = typeof setMask === "bigint" ? setMask : BigInt(setMask);
  if (mask < 0n) {
    throw new Error("invalid_set_mask");
  }
  return mask;
}

export function rfqAcceptsSetId(setMask: string | bigint, setId: number): boolean {
  const mask = toSetMaskBigInt(setMask);
  if (mask === 0n) {
    return true;
  }
  return (mask & (1n << BigInt(setId))) !== 0n;
}

export function decodeAcceptedSetIds(setMask: string | bigint, maxSetId = MAX_SET_ID): number[] {
  const mask = toSetMaskBigInt(setMask);
  if (mask === 0n) {
    return [];
  }

  const accepted: number[] = [];
  for (let setId = 0; setId <= maxSetId; setId++) {
    if ((mask & (1n << BigInt(setId))) !== 0n) {
      accepted.push(setId);
    }
  }
  return accepted;
}

export function isRfqExpired(expiryUnix: number, nowUnix: number): boolean {
  return expiryUnix !== 0 && expiryUnix < nowUnix;
}
