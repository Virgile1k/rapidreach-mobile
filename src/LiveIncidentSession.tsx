import Geolocation from "@react-native-community/geolocation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import {
  fetchCitizenSessionSummary,
  postCitizenSessionHeartbeat,
  postCitizenSessionLocation,
  postCitizenSessionMarkSafe,
  type CitizenSessionSummary,
} from "./api";
import { subscribeCitizenIncidentSession, type IncidentTopicPayload } from "./realtime";
import { prepareCitizenTts, speakCitizenSessionLine } from "./speakCitizenSession";

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

export type LiveIncidentSessionProps = {
  incidentId: string;
  referenceNo: string | null;
  initialStatus: string | null;
  citizenSessionToken: string;
  onEndSession: () => void;
};

export function LiveIncidentSession({
  incidentId,
  referenceNo,
  initialStatus,
  citizenSessionToken,
  onEndSession,
}: LiveIncidentSessionProps) {
  const [elapsed, setElapsed] = useState(0);
  const [statusLine, setStatusLine] = useState(initialStatus ?? "—");
  const [networkHint, setNetworkHint] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastAutomatedLine, setLastAutomatedLine] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"loc" | "safe" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tokenRef = useRef(citizenSessionToken);
  tokenRef.current = citizenSessionToken;

  const refreshSummary = useCallback(async () => {
    try {
      const s: CitizenSessionSummary = await fetchCitizenSessionSummary(incidentId, citizenSessionToken);
      if (s.status) setStatusLine(s.status);
      if (s.deviceStatus != null && String(s.deviceStatus).trim()) {
        const reach =
          s.deviceReachable === true ? "reachable" : s.deviceReachable === false ? "limited" : "unknown";
        setNetworkHint("Network signal: " + String(s.deviceStatus) + " (" + reach + ")");
      } else if (s.deviceReachable != null) {
        setNetworkHint(s.deviceReachable ? "Device connectivity: OK" : "Device connectivity: degraded");
      } else {
        setNetworkHint(null);
      }
    } catch {
      /* offline — keep prior hints */
    }
  }, [citizenSessionToken, incidentId]);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void refreshSummary();
    const poll = setInterval(() => void refreshSummary(), 30000);
    return () => clearInterval(poll);
  }, [refreshSummary]);

  useEffect(() => {
    void prepareCitizenTts().catch(() => {
      /* Engine missing — UI text still works; avoid crashing session */
    });
  }, []);

  useEffect(() => {
    const hb = setInterval(() => {
      void postCitizenSessionHeartbeat(incidentId, tokenRef.current).catch(() => {});
    }, 45000);
    return () => clearInterval(hb);
  }, [incidentId]);

  useEffect(() => {
    const unsub = subscribeCitizenIncidentSession(
      incidentId,
      (payload: IncidentTopicPayload) => {
        const t = typeof payload.type === "string" ? payload.type.trim() : "";
        if ((t === "INCIDENT_UPDATED" || t === "INCIDENT_INTAKE") && payload.status) {
          setStatusLine(payload.status);
        }
        if (t === "DISPATCH_MESSAGE" && payload.message?.trim()) {
          const msg = payload.message.trim();
          setLastAutomatedLine(msg);
          speakCitizenSessionLine("Automated message from dispatch. " + msg);
        }
        if (t === "CITIZEN_SESSION_ACK" && payload.message?.trim()) {
          const msg = payload.message.trim();
          setLastAutomatedLine(msg);
          speakCitizenSessionLine(msg);
        }
      },
      () => setWsConnected(true),
    );
    return unsub;
  }, [incidentId]);

  async function onShareLocation() {
    setActionError(null);
    setBusyAction("loc");
    try {
      const coords = await new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 8000);
        Geolocation.getCurrentPosition(
          (p) => {
            clearTimeout(timer);
            resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude });
          },
          () => {
            clearTimeout(timer);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 },
        );
      });
      if (!coords) {
        throw new Error("Could not read GPS. Try again near a window or enable location.");
      }
      await postCitizenSessionLocation(incidentId, citizenSessionToken, coords.latitude, coords.longitude);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Location update failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function onMarkSafe() {
    setActionError(null);
    setBusyAction("safe");
    try {
      await postCitizenSessionMarkSafe(incidentId, citizenSessionToken);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusyAction(null);
    }
  }

  const ref = referenceNo?.trim() || incidentId.slice(0, 8);

  return (
    <View className="gap-4">
      <View className="rounded-3xl border border-emerald-500/35 bg-emerald-950/40 px-4 py-4">
        <Text className="text-center text-[11px] font-semibold uppercase tracking-wider text-emerald-200/90">
          Live session · stay on this screen
        </Text>
        <Text className="mt-2 text-center text-[22px] font-bold tabular-nums text-white">{formatElapsed(elapsed)}</Text>
        <Text className="mt-1 text-center text-[13px] text-emerald-100/90">Reference {ref}</Text>
        <Text className="mt-2 text-center text-[12px] text-emerald-100/75">
          Status: {statusLine}
          {" · "}
          {wsConnected ? "Updates connected" : "Connecting for updates…"}
        </Text>
        {networkHint ? (
          <Text className="mt-2 text-center text-[11px] leading-4 text-emerald-200/70">{networkHint}</Text>
        ) : null}
      </View>

      <View className="rounded-2xl border border-white/10 bg-neutral-card px-4 py-3">
        <Text className="text-[11px] font-semibold uppercase tracking-wider text-brand-mist">
          Latest automated voice / text
        </Text>
        <Text className="mt-2 text-[13px] leading-5 text-white">
          {lastAutomatedLine?.trim()
            ? lastAutomatedLine
            : "When dispatch sends a short message, it appears here and is read aloud when possible."}
        </Text>
      </View>

      {actionError ? (
        <View className="rounded-2xl border border-red-400/35 bg-red-500/15 px-3 py-2">
          <Text className="text-center text-[12px] text-red-100">{actionError}</Text>
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        <Pressable
          className="native:flex-1 items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 active:opacity-90 disabled:opacity-45"
          onPress={() => void onShareLocation()}
          disabled={busyAction !== null}>
          {busyAction === "loc" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-center text-[13px] font-semibold text-white">Share location again</Text>
          )}
        </Pressable>
        <Pressable
          className="native:flex-1 items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 active:opacity-90 disabled:opacity-45"
          onPress={() => void onMarkSafe()}
          disabled={busyAction !== null}>
          {busyAction === "safe" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-center text-[13px] font-semibold text-white">I'm safe</Text>
          )}
        </Pressable>
      </View>

      <Pressable
        className="items-center rounded-2xl border border-white/10 py-3 active:opacity-80"
        onPress={onEndSession}>
        <Text className="text-[12px] font-medium text-brand-mist">End session on this device</Text>
      </Pressable>

      <Text className="text-center text-[11px] leading-4 text-brand-mist/90">
        This is not a phone call to emergency services. Messages may be read by automated voice. For life-threatening
        emergencies, also contact local emergency numbers if you can.
      </Text>
    </View>
  );
}
