import { useCallback, useEffect, useRef, useState } from "react";

export type PairCode = { value: string; scope: string; expiresAt: number };

export function issuedPairCode(reply: any, scope: string, requestedAt: number): PairCode | null {
  if (!/^\d{6}$/.test(reply?.pairCode) || !Number.isFinite(reply?.expiresIn) || reply.expiresIn <= 0) return null;
  return { value: reply.pairCode, scope, expiresAt: requestedAt + reply.expiresIn * 1000 };
}

export function visiblePairCode(pair: PairCode | null, scope: string, now: number): string {
  return pair && pair.scope === scope && now < pair.expiresAt ? pair.value : "";
}

export function usePairCode(scope: string, connected: boolean, request: (event: string, payload?: any) => Promise<any>) {
  const [pair, setPair] = useState<PairCode | null>(null);
  const [now, setNow] = useState(Date.now());
  const scopeRef = useRef(scope), serial = useRef(0);
  scopeRef.current = scope;
  const clearCode = useCallback(() => { serial.current++; setPair(null); }, []);
  useEffect(clearCode, [scope, clearCode]);
  useEffect(() => { if (connected) clearCode(); }, [connected, clearCode]);
  useEffect(() => {
    if (!pair) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time >= pair.expiresAt) clearCode();
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [pair, clearCode]);
  useEffect(() => () => { serial.current++; }, []);
  const generateCode = async (payload: any = {}) => {
    clearCode();
    const sequence = serial.current, requestedScope = scopeRef.current, requestedAt = Date.now();
    const reply = await request("controller:code", payload);
    if (reply && sequence === serial.current && requestedScope === scopeRef.current) {
      setNow(Date.now());
      setPair(issuedPairCode(reply, requestedScope, requestedAt));
    }
  };
  const code = visiblePairCode(pair, scope, Math.max(now, Date.now()));
  return { code, clearCode, generateCode, secondsRemaining: code && pair ? Math.max(0, Math.ceil((pair.expiresAt - Math.max(now, Date.now())) / 1000)) : 0 };
}
