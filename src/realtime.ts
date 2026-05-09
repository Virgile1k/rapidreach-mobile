import { AppState, type AppStateStatus } from "react-native";

import { API_BASE } from "./config";

export type IncidentAlertPayload = {
  type?: string;
  incidentId?: string;
  referenceNo?: string;
  status?: string;
  incidentLatitude?: number;
  incidentLongitude?: number;
  address?: string | null;
  distanceKm?: number | null;
  emergencyTypeName?: string | null;
  organizationId?: string | null;
};

type Handler = (payload: IncidentAlertPayload) => void;

function decodeWsPayloadSync(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return "";
}

async function decodeWsPayloadAsync(data: unknown): Promise<string> {
  const sync = decodeWsPayloadSync(data);
  if (sync.length > 0) return sync;
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.text();
  return "";
}

/** Raw STOMP 1.2 over WebSocket (same wire protocol as rapidreach-fn). Handles heart-beats, fragmentation, resume. */
export function subscribeResponderAlerts(
  responderId: string,
  organizationId: string | null,
  onMessage: Handler,
  onConnected?: () => void,
): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let receiveBuffer = "";
  let attempt = 0;

  const clearReconnectTimer = () => {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    clearReconnectTimer();
    attempt += 1;
    const base = Math.min(28000, 800 * Math.pow(2, Math.min(attempt - 1, 5)));
    const delay = base + Math.random() * 600;
    reconnectTimer = setTimeout(connect, delay);
  };

  const subscribeTopics = (socket: WebSocket) => {
    if (organizationId) {
      socket.send(
        `SUBSCRIBE\nid:sub-org\ndestination:/topic/organizations/${organizationId}/incidents\n\n\u0000`,
      );
    }
    socket.send(`SUBSCRIBE\nid:sub-res\ndestination:/topic/responders/${responderId}\n\n\u0000`);
  };

  const processFrame = (frame: string) => {
    const trimmed = frame.replace(/\r\n/g, "\n");
    if (trimmed.startsWith("CONNECTED")) {
      subscribeTopics(ws!);
      onConnected?.();
      return;
    }
    if (!trimmed.startsWith("MESSAGE")) return;
    const bodyIdx = trimmed.indexOf("\n\n");
    if (bodyIdx < 0) return;
    const body = trimmed.slice(bodyIdx + 2).trim();
    if (!body) return;
    try {
      const parsed = JSON.parse(body) as IncidentAlertPayload;
      onMessage(parsed);
    } catch {
      // ignore non-JSON
    }
  };

  const consumeHeartbeats = (socket: WebSocket, chunk: string): string => {
    let i = 0;
    while (i < chunk.length && chunk[i] === "\n") {
      socket.send("\n");
      i += 1;
    }
    return chunk.slice(i);
  };

  const flushNullDelimitedFrames = () => {
    while (true) {
      const idx = receiveBuffer.indexOf("\u0000");
      if (idx < 0) break;
      const frame = receiveBuffer.slice(0, idx);
      receiveBuffer = receiveBuffer.slice(idx + 1);
      if (frame.length > 0) {
        processFrame(frame);
      }
    }
  };

  let inboundSerial = Promise.resolve();

  const connect = () => {
    if (stopped) return;
    clearReconnectTimer();
    receiveBuffer = "";
    try {
      const httpUrl = new URL(API_BASE);
      const wsScheme = httpUrl.protocol === "https:" ? "wss:" : "ws:";
      const basePath =
        httpUrl.pathname && httpUrl.pathname !== "/" ? httpUrl.pathname.replace(/\/$/, "") : "";
      const wsUrl = `${wsScheme}//${httpUrl.host}${basePath}/ws`;
      ws = new WebSocket(wsUrl, ["v12.stomp"]);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        attempt = 0;
        ws?.send("CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n\u0000");
      };

      ws.onmessage = (event) => {
        inboundSerial = inboundSerial
          .then(async () => {
            let chunk = await decodeWsPayloadAsync(event.data);
            if (!chunk.length) return;

            // Lone STOMP heart-beat from broker
            if (chunk === "\n") {
              ws?.send("\n");
              return;
            }

            const socket = ws;
            if (!socket) return;

            chunk = consumeHeartbeats(socket, chunk);
            if (!chunk.length) return;

            receiveBuffer += chunk;
            flushNullDelimitedFrames();
          })
          .catch(() => {});
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          // noop
        }
      };

      ws.onclose = () => {
        ws = null;
        if (!stopped) scheduleReconnect();
      };
    } catch {
      scheduleReconnect();
    }
  };

  const onAppState = (next: AppStateStatus) => {
    if (stopped || next !== "active") return;
    try {
      ws?.close();
    } catch {
      // noop
    }
  };

  const appSub = AppState.addEventListener("change", onAppState);

  connect();

  return () => {
    stopped = true;
    clearReconnectTimer();
    appSub.remove();
    try {
      ws?.close();
    } catch {
      // noop
    }
    ws = null;
  };
}
