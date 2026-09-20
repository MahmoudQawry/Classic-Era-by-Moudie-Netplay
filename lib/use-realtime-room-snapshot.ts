import { useCallback, useEffect, useRef, useState } from "react";

import { getRealtimeRoomSnapshot, type RealtimeSnapshot } from "@/lib/realtime-room-service";
import type { RoomCredential } from "@/lib/room-storage";

const RETRY_DELAYS_MS = [350, 800, 1500];

export function useRealtimeRoomSnapshot(roomId: number, credential: RoomCredential | null | undefined, refreshInterval = 3_000) {
  const [data, setData] = useState<RealtimeSnapshot | undefined>();
  const [isLoading, setIsLoading] = useState(Boolean(credential));
  const [error, setError] = useState<Error | null>(null);
  const requestSerial = useRef(0);

  const refetch = useCallback(async () => {
    if (!credential || !Number.isFinite(roomId)) return;
    const serial = ++requestSerial.current;
    let lastReason: unknown = null;
    for(let attempt=0; attempt<=RETRY_DELAYS_MS.length; attempt++){
      try {
        if(attempt>0) await new Promise(resolve=>setTimeout(resolve,RETRY_DELAYS_MS[attempt-1]));
        if(serial!==requestSerial.current) return;
        const snapshot = await getRealtimeRoomSnapshot({ roomId, memberId: credential.memberId, memberToken: credential.memberToken });
        if(serial!==requestSerial.current) return;
        setError(null);
        setData(snapshot);
        setIsLoading(false);
        return;
      } catch(reason) {
        lastReason=reason;
      }
    }
    if(serial!==requestSerial.current) return;
    setError(lastReason instanceof Error ? lastReason : new Error("Could not load room details."));
    setIsLoading(false);
  }, [credential, roomId]);

  useEffect(() => {
    requestSerial.current++;
    setData(undefined);
    setError(null);
    setIsLoading(Boolean(credential));
    void refetch();
    if (!credential || !Number.isFinite(roomId)) return;
    const interval = setInterval(() => void refetch(), refreshInterval);
    return () => { clearInterval(interval); requestSerial.current++; };
  }, [credential, refreshInterval, refetch, roomId]);

  return { data, isLoading, error, refetch };
}
