import { API_BASE } from "./config";


export class UnauthorizedError extends Error {
  constructor(message = "Session expired. Sign in again.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}


export function normalizeBearerToken(raw: string): string {
  let t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function actionOk(action: unknown): boolean {
  return action === 1 || action === "1";
}

function bearerHeaders(token: string): Record<string, string> {
  const t = normalizeBearerToken(token);
  return {
    Authorization: `Bearer ${t}`,
    /** Some gateways strip Authorization; backend accepts this duplicate (see JwtAuthenticationFilter). */
    "X-Access-Token": t,
    Accept: "application/json",
    "User-Agent": "RapidReach-Mobile/1.0",
  };
}

function throwIfUnauthorized(res: Response, json: { message?: string }) {
  if (res.status === 401) {
    throw new UnauthorizedError(json.message?.trim() || "Session expired. Sign in again.");
  }
}

export type LoginResult = {
  accessToken: string;
  tokenType: string;
  userId: string;
  organizationId: string | null;
  /** Always true when login succeeds via {@link loginResponder}. */
  isResponder: true;
};

export function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = normalizeBearerToken(token).split(".");
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    if (pad === 2) payload += "==";
    else if (pad === 3) payload += "=";
    const g = globalThis as typeof globalThis & { atob?: (data: string) => string };
    if (typeof g.atob !== "function") return null;
    const json = JSON.parse(g.atob(payload)) as { exp?: unknown };
    if (typeof json.exp !== "number") return null;
    return json.exp * 1000;
  } catch {
    return null;
  }
}

/** JWT `sub` (user id) — used to treat renewals as the same session without refetching profile. */
export function decodeJwtSub(token: string): string | null {
  try {
    const parts = normalizeBearerToken(token).split(".");
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    if (pad === 2) payload += "==";
    else if (pad === 3) payload += "=";
    const g = globalThis as typeof globalThis & { atob?: (data: string) => string };
    if (typeof g.atob !== "function") return null;
    const json = JSON.parse(g.atob(payload)) as { sub?: unknown };
    if (typeof json.sub !== "string" || !json.sub.trim()) return null;
    return json.sub.trim();
  } catch {
    return null;
  }
}

/**
 * Extends responder session with a new JWT (same rules as login). Call only while the current token is still valid.
 */
export async function renewResponderSession(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/dispatch/me/session/renew`, {
    method: "POST",
    headers: bearerHeaders(token),
  });
  const json = (await res.json()) as {
    action?: number | string;
    message?: string;
    data?: {
      accessToken?: string;
      token?: string;
    };
  };
  throwIfUnauthorized(res, json);
  const accessToken =
    typeof json.data?.accessToken === "string" && json.data.accessToken.length > 0
      ? json.data.accessToken
      : typeof json.data?.token === "string" && json.data.token.length > 0
        ? json.data.token
        : undefined;
  const actionOk = json.action === 1 || json.action === "1";
  if (!res.ok || !actionOk || !accessToken) {
    throw new Error(json.message?.trim() || "Could not renew session.");
  }
  return normalizeBearerToken(accessToken);
}

/**
 * Responder mobile sign-in — calls POST /api/auth/login/responder (rejects non-responder accounts).
 */
export async function loginResponder(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/api/auth/login/responder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "RapidReach-Mobile/1.0",
    },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const json = (await res.json()) as {
    action?: number | string;
    message?: string;
    data?: {
      accessToken?: string;
      token?: string;
      tokenType?: string;
      isResponder?: boolean;
      user?: {
        id?: string | number;
        organizationId?: string | null;
        isResponder?: boolean;
      };
    };
  };

  const data = json.data;
  const user = data?.user;
  const accessToken =
    typeof data?.accessToken === "string" && data.accessToken.length > 0
      ? data.accessToken
      : typeof data?.token === "string" && data.token.length > 0
        ? data.token
        : undefined;
  const userId = user?.id != null ? String(user.id) : undefined;

  /** Backend uses numeric action; tolerate string "1" from proxies. */
  const actionOk = json.action === 1 || json.action === "1";

  /**
   * Only `/api/auth/login/responder` is called here — the server already rejects non-responders.
   * Older deployments omit `isResponder` on the payload; do not require those flags.
   */
  if (!res.ok || !actionOk || !accessToken || !userId) {
    throw new Error(json.message?.trim() || "Login failed. Use an account with an active responder profile.");
  }

  const explicitNonResponder =
    data?.isResponder === false || user?.isResponder === false;
  if (explicitNonResponder) {
    throw new Error(
      json.message?.trim() || "This account is not authorized as a responder on this server.",
    );
  }

  return {
    accessToken: normalizeBearerToken(accessToken),
    tokenType: data?.tokenType ?? "Bearer",
    userId,
    organizationId:
      user?.organizationId != null ? String(user.organizationId) : null,
    isResponder: true,
  };
}

export type EmergencyType = { id: string; name: string };

const JSON_HEADERS = {
  Accept: "application/json",
  "User-Agent": "RapidReach-Mobile/1.0",
} as const;

/**
 * Loads catalog via GET /api/emergency-types/all (simple array in `data`).
 * Throws on network/TLS errors so the UI can show a real message (hosted URL can still fail from device).
 */
export async function fetchEmergencyTypes(): Promise<EmergencyType[]> {
  const url = `${API_BASE}/api/emergency-types/all`;
  let res: Response;
  try {
    res = await fetch(url, { headers: JSON_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Network error calling ${url}: ${msg}`);
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text.trim() ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON from emergency-types (${res.status}). First bytes: ${text.slice(0, 160)}`);
  }

  const json = parsed as {
    action?: number;
    message?: string;
    data?: { id: string; name: string }[];
  };

  if (!res.ok) {
    throw new Error(
      json.message?.trim() || `Emergency types HTTP ${res.status}`,
    );
  }
  if (json.action !== 1 || !Array.isArray(json.data)) {
    throw new Error(json.message?.trim() || "Unexpected emergency-types response shape.");
  }
  return json.data.map((t) => ({ id: String(t.id), name: String(t.name ?? "") }));
}

export type SosIntakeResult = {
  incidentId: string;
  referenceNo: string | null;
  status: string | null;
  /** Present when backend supports citizen live session (X-Citizen-Session). */
  citizenSessionToken: string | null;
};

const CITIZEN_SESSION_HEADER = "X-Citizen-Session";

export type CitizenSessionSummary = {
  incidentId: string;
  referenceNo: string | null;
  status: string | null;
  deviceReachable: boolean | null;
  deviceStatus: string | null;
};

export async function fetchCitizenSessionSummary(
  incidentId: string,
  sessionToken: string,
): Promise<CitizenSessionSummary> {
  const res = await fetch(
    `${API_BASE}/api/emergency/incidents/${encodeURIComponent(incidentId)}/citizen-session/summary`,
    {
      headers: {
        Accept: "application/json",
        [CITIZEN_SESSION_HEADER]: sessionToken,
        "User-Agent": "RapidReach-Mobile/1.0",
      },
    },
  );
  const json = (await res.json()) as {
    incidentId?: string;
    referenceNo?: string | null;
    status?: string | null;
    deviceReachable?: boolean | null;
    deviceStatus?: string | null;
    message?: string;
  };
  if (!res.ok || !json.incidentId) {
    throw new Error(json.message?.trim() || "Could not load session summary.");
  }
  return {
    incidentId: String(json.incidentId),
    referenceNo: json.referenceNo ?? null,
    status: json.status ?? null,
    deviceReachable: json.deviceReachable ?? null,
    deviceStatus: json.deviceStatus ?? null,
  };
}

export async function postCitizenSessionLocation(
  incidentId: string,
  sessionToken: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/emergency/incidents/${encodeURIComponent(incidentId)}/citizen-session/location`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        [CITIZEN_SESSION_HEADER]: sessionToken,
        "User-Agent": "RapidReach-Mobile/1.0",
      },
      body: JSON.stringify({ latitude, longitude }),
    },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message?.trim() || "Could not share location.");
  }
}

export async function postCitizenSessionMarkSafe(incidentId: string, sessionToken: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/emergency/incidents/${encodeURIComponent(incidentId)}/citizen-session/mark-safe`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        [CITIZEN_SESSION_HEADER]: sessionToken,
        "User-Agent": "RapidReach-Mobile/1.0",
      },
    },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message?.trim() || "Could not record status.");
  }
}

export async function postCitizenSessionHeartbeat(incidentId: string, sessionToken: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/emergency/incidents/${encodeURIComponent(incidentId)}/citizen-session/heartbeat`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        [CITIZEN_SESSION_HEADER]: sessionToken,
        "User-Agent": "RapidReach-Mobile/1.0",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Heartbeat failed (${res.status}).`);
  }
}

export async function postSosIntake(body: {
  emergencyTypeId: string;
  phoneNumber: string;
  organizationId?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  emergencyText?: string;
  voiceTranscript?: string;
  skipCamara?: boolean;
}): Promise<SosIntakeResult> {
  const res = await fetch(`${API_BASE}/api/emergency/sos/intake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "RapidReach-Mobile/1.0",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    incidentId?: string;
    referenceNo?: string | null;
    status?: string | null;
    citizenSessionToken?: string | null;
    message?: string;
  };
  if (!res.ok || !json.incidentId) {
    throw new Error(json.message?.trim() || "SOS intake failed.");
  }
  const tok =
    json.citizenSessionToken != null && String(json.citizenSessionToken).trim()
      ? String(json.citizenSessionToken).trim()
      : null;
  return {
    incidentId: String(json.incidentId),
    referenceNo: json.referenceNo ?? null,
    status: json.status ?? null,
    citizenSessionToken: tok,
  };
}

export async function fetchProfile(
  token: string,
): Promise<{ organizationId: string | null; isResponder?: boolean }> {
  const res = await fetch(`${API_BASE}/api/users/profile`, {
    headers: bearerHeaders(token),
  });
  const json = (await res.json()) as {
    action?: number | string;
    data?: {
      organizationId?: string | null;
      isResponder?: boolean;
    };
    message?: string;
  };
  throwIfUnauthorized(res, json);
  if (!res.ok || !actionOk(json.action) || !json.data) {
    throw new Error(json.message?.trim() || "Could not load profile.");
  }
  return {
    organizationId:
      json.data.organizationId != null ? String(json.data.organizationId) : null,
    isResponder:
      typeof json.data.isResponder === "boolean" ? json.data.isResponder : undefined,
  };
}

export async function fetchMyResponder(token: string): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/api/dispatch/me/responder`, {
    headers: bearerHeaders(token),
  });
  const json = (await res.json()) as {
    action?: number | string;
    data?: {
      id?: string;
      userId?: string;
    };
    message?: string;
  };
  throwIfUnauthorized(res, json);
  if (!res.ok || !actionOk(json.action) || !json.data?.id) {
    throw new Error(json.message?.trim() || "Not a responder account.");
  }
  return {
    id: String(json.data.id),
  };
}

export type MyAssignment = {
  assignmentId: string;
  incidentId: string;
  referenceNo: string | null;
  incidentStatus: string | null;
  assignmentStatus: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  emergencyTypeName: string | null;
};

function parseAssignment(raw: Record<string, unknown>): MyAssignment {
  return {
    assignmentId: String(raw.assignmentId ?? ""),
    incidentId: String(raw.incidentId ?? ""),
    referenceNo: raw.referenceNo != null ? String(raw.referenceNo) : null,
    incidentStatus: raw.incidentStatus != null ? String(raw.incidentStatus) : null,
    assignmentStatus: raw.assignmentStatus != null ? String(raw.assignmentStatus) : null,
    assignedAt: raw.assignedAt != null ? String(raw.assignedAt) : null,
    acceptedAt: raw.acceptedAt != null ? String(raw.acceptedAt) : null,
    arrivedAt: raw.arrivedAt != null ? String(raw.arrivedAt) : null,
    completedAt: raw.completedAt != null ? String(raw.completedAt) : null,
    latitude: typeof raw.latitude === "number" ? raw.latitude : null,
    longitude: typeof raw.longitude === "number" ? raw.longitude : null,
    address: raw.address != null ? String(raw.address) : null,
    emergencyTypeName: raw.emergencyTypeName != null ? String(raw.emergencyTypeName) : null,
  };
}

/** Active assignments for the signed-in responder (includes completed rows). */
export async function fetchMyAssignments(token: string): Promise<MyAssignment[]> {
  const res = await fetch(`${API_BASE}/api/dispatch/me/assignments`, {
    headers: bearerHeaders(token),
  });
  const json = (await res.json()) as {
    action?: number | string;
    message?: string;
    data?: Record<string, unknown>[];
  };
  throwIfUnauthorized(res, json);
  if (!res.ok || !actionOk(json.action) || !Array.isArray(json.data)) {
    throw new Error(json.message?.trim() || "Could not load assignments.");
  }
  return json.data.map((row) => parseAssignment(row));
}

export async function acceptAssignment(token: string, assignmentId: string): Promise<MyAssignment> {
  const res = await fetch(`${API_BASE}/api/dispatch/me/assignments/${assignmentId}/accept`, {
    method: "POST",
    headers: bearerHeaders(token),
  });
  const json = (await res.json()) as {
    action?: number | string;
    message?: string;
    data?: Record<string, unknown>;
  };
  throwIfUnauthorized(res, json);
  if (!res.ok || !actionOk(json.action) || !json.data) {
    throw new Error(json.message?.trim() || "Could not accept assignment.");
  }
  return parseAssignment(json.data);
}

export async function markAssignmentArrived(token: string, assignmentId: string): Promise<MyAssignment> {
  const res = await fetch(`${API_BASE}/api/dispatch/me/assignments/${assignmentId}/arrive`, {
    method: "POST",
    headers: bearerHeaders(token),
  });
  const json = (await res.json()) as {
    action?: number | string;
    message?: string;
    data?: Record<string, unknown>;
  };
  throwIfUnauthorized(res, json);
  if (!res.ok || !actionOk(json.action) || !json.data) {
    throw new Error(json.message?.trim() || "Could not mark arrival.");
  }
  return parseAssignment(json.data);
}

export async function completeAssignment(token: string, assignmentId: string): Promise<MyAssignment> {
  const res = await fetch(`${API_BASE}/api/dispatch/me/assignments/${assignmentId}/complete`, {
    method: "POST",
    headers: bearerHeaders(token),
  });
  const json = (await res.json()) as {
    action?: number | string;
    message?: string;
    data?: Record<string, unknown>;
  };
  throwIfUnauthorized(res, json);
  if (!res.ok || !actionOk(json.action) || !json.data) {
    throw new Error(json.message?.trim() || "Could not complete assignment.");
  }
  return parseAssignment(json.data);
}

export type IncidentRoutePayload = {
  id: string;
  incidentId: string | null;
  ambulanceId: string | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  provider: string | null;
  routePolyline: string | null;
  trafficLevel: string | null;
  createdAt: string | null;
};

function parseIncidentRoutePayload(raw: Record<string, unknown>): IncidentRoutePayload {
  return {
    id: String(raw.id ?? ""),
    incidentId: raw.incidentId != null ? String(raw.incidentId) : null,
    ambulanceId: raw.ambulanceId != null ? String(raw.ambulanceId) : null,
    distanceKm: typeof raw.distanceKm === "number" ? raw.distanceKm : null,
    etaMinutes: typeof raw.etaMinutes === "number" ? raw.etaMinutes : null,
    provider: raw.provider != null ? String(raw.provider) : null,
    routePolyline: typeof raw.routePolyline === "string" ? raw.routePolyline : null,
    trafficLevel: raw.trafficLevel != null ? String(raw.trafficLevel) : null,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : null,
  };
}

/**
 * Latest stored OSRM route for an incident when the responder has an open assignment (GET
 * /api/dispatch/me/incidents/{id}/route). Returns null when there is no assignment, no route yet, or 404.
 */
export async function fetchMyIncidentRoute(
  token: string,
  incidentId: string,
): Promise<IncidentRoutePayload | null> {
  const res = await fetch(
    `${API_BASE}/api/dispatch/me/incidents/${encodeURIComponent(incidentId)}/route`,
    { headers: bearerHeaders(token) },
  );
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid JSON from incident route (${res.status}).`);
  }
  const json = parsed as {
    action?: number | string;
    message?: string;
    data?: Record<string, unknown>;
  };
  throwIfUnauthorized(res, json);
  if (res.status === 404) return null;
  if (!actionOk(json.action) || !json.data) return null;
  return parseIncidentRoutePayload(json.data);
}

export async function updateResponderPosition(
  token: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/dispatch/me/position`, {
    method: "PUT",
    headers: {
      ...bearerHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ latitude, longitude }),
  });
  const json = (await res.json()) as { action?: number | string; message?: string };
  throwIfUnauthorized(res, json);
  if (!res.ok || !actionOk(json.action)) {
    throw new Error(json.message?.trim() || "Could not update position.");
  }
}

export async function fetchMobileOauthUrl(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/dispatch/me/mobile-oauth-url`);
  const json = (await res.json()) as {
    action?: number;
    data?: { authorizeUrl?: string | null };
  };
  if (!res.ok || json.action !== 1) return null;
  const u = json.data?.authorizeUrl;
  return u && u.trim() !== "" ? u.trim() : null;
}
