import "./global.css";

import AsyncStorage from "@react-native-async-storage/async-storage";
import Geolocation from "@react-native-community/geolocation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  acceptAssignment,
  completeAssignment,
  decodeJwtExpMs,
  fetchEmergencyTypes,
  fetchMyAssignments,
  fetchMyResponder,
  fetchProfile,
  loginResponder,
  markAssignmentArrived,
  normalizeBearerToken,
  postSosIntake,
  renewResponderSession,
  UnauthorizedError,
  updateResponderPosition,
  type MyAssignment,
} from "./src/api";
import { playIncidentAssignedFeedback } from "./src/playAlertFeedback";
import { subscribeResponderAlerts, type IncidentAlertPayload } from "./src/realtime";
import { API_BASE, FALLBACK_EMERGENCY_TYPE_ID, USE_LOCAL_BACKEND } from "./src/config";

const TOKEN_KEY = "rapidreach_token";

const layout = StyleSheet.create({
  headerShadow:
    Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 14,
        }
      : { elevation: 14 },
  cardShadow:
    Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 16,
        }
      : { elevation: 8 },
  fabShadow:
    Platform.OS === "ios"
      ? {
          shadowColor: "#b71c1c",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.45,
          shadowRadius: 18,
        }
      : { elevation: 16 },
});

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0c1526" translucent={Platform.OS === "android"} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"citizen" | "responder">("citizen");
  /** Lives in parent so switching Citizen ↔ Responder does not remount with empty token. */
  const [responderToken, setResponderToken] = useState<string | null>(null);
  const [responderStorageHydrated, setResponderStorageHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(TOKEN_KEY);
        if (!cancelled && raw?.trim()) {
          setResponderToken(normalizeBearerToken(raw));
          setMode("responder");
        }
      } finally {
        if (!cancelled) setResponderStorageHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View className="flex-1 bg-neutral-dark">
      <View
        style={[layout.headerShadow, { paddingTop: Math.max(insets.top, 14) }]}
        className="border-b border-white/10 bg-brand-slate px-5 pb-4">
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-emergency">
            <Text className="-mt-0.5 text-[26px] font-bold leading-none text-white">+</Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-xl font-bold tracking-tight text-white">RapidReach</Text>
            <Text className="mt-0.5 text-[13px] leading-4 text-brand-mist">
              SOS intake · responder alerts
            </Text>
          </View>
        </View>
        {__DEV__ ? (
          <Text className="mt-2 rounded-lg bg-black/25 px-2 py-1.5 text-[10px] text-white/45" selectable>
            API {USE_LOCAL_BACKEND ? "(local)" : "(hosted)"}: {API_BASE}
          </Text>
        ) : null}

        <View className="mt-4 flex-row gap-2 rounded-2xl bg-black/20 p-1">
          <ModeTab active={mode === "citizen"} label="Citizen SOS" onPress={() => setMode("citizen")} />
          <ModeTab active={mode === "responder"} label="Responder" onPress={() => setMode("responder")} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View className="gap-5 px-5 pb-12 pt-5">
          {mode === "citizen" ? (
            <CitizenPanel />
          ) : (
            <ResponderPanel
              token={responderToken}
              setToken={setResponderToken}
              storageHydrated={responderStorageHydrated}
              onResponderLoggedIn={() => setMode("responder")}
              onResponderLoggedOut={() => setMode("citizen")}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ModeTab({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-xl py-3 ${active ? "bg-white" : "bg-transparent"}`}>
      <Text
        className={`text-center text-[13px] font-semibold ${active ? "text-brand-slate" : "text-white/75"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function CitizenPanel() {
  const [defaultTypeId, setDefaultTypeId] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBootstrapError(null);
      try {
        const list = await fetchEmergencyTypes();
        if (cancelled) return;
        if (list.length > 0) {
          setDefaultTypeId(list[0].id);
          return;
        }
        const fb = FALLBACK_EMERGENCY_TYPE_ID.trim();
        if (fb) {
          setDefaultTypeId(fb);
        } else {
          setBootstrapError(
            "Server has no emergency types yet. Add some in admin/Swagger, or set FALLBACK_EMERGENCY_TYPE_ID in src/config.ts.",
          );
        }
      } catch (e) {
        if (!cancelled) {
          const fb = FALLBACK_EMERGENCY_TYPE_ID.trim();
          if (fb) {
            setDefaultTypeId(fb);
            setBootstrapError(
              `Using fallback emergency type (catalog load failed). ${e instanceof Error ? e.message : String(e)}`,
            );
          } else {
            setBootstrapError(e instanceof Error ? e.message : String(e));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCallForHelp() {
    setSubmitting(true);
    setResult(null);
    try {
      const trimmed = phone.trim();
      if (trimmed.length < 6) {
        throw new Error("Enter your phone number.");
      }
      if (!defaultTypeId) {
        throw new Error(
          bootstrapError?.trim() ||
            "No emergency type ID available. Fix catalog load or set FALLBACK_EMERGENCY_TYPE_ID in src/config.ts.",
        );
      }

      const coords = await getLocationQuick();

      const body: Parameters<typeof postSosIntake>[0] = {
        emergencyTypeId: defaultTypeId,
        phoneNumber: trimmed,
      };
      if (coords) {
        body.latitude = coords.latitude;
        body.longitude = coords.longitude;
      }

      const res = await postSosIntake(body);
      setResult(
        `Help requested · ${res.referenceNo ?? res.incidentId.slice(0, 8)} (${res.status ?? "ok"})`,
      );
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const ok = result?.startsWith("Help requested");

  return (
    <View className="gap-5">
      <View style={layout.cardShadow} className="rounded-3xl border border-white/10 bg-neutral-elevated p-5">
        <Text className="text-[15px] font-semibold text-white">Need emergency help?</Text>
        <Text className="mt-2 text-[14px] leading-5 text-brand-mist">
          Enter the phone number for this device. We send your location when available and open an incident with
          RapidReach.
        </Text>
      </View>

      {bootstrapError ? (
        <View className="rounded-2xl border border-warning/40 bg-warning/15 px-4 py-3">
          <Text className="text-center text-[12px] leading-5 text-amber-50" selectable>
            {bootstrapError}
          </Text>
        </View>
      ) : null}

      <View style={layout.cardShadow} className="rounded-3xl border border-white/10 bg-neutral-card p-5">
        <Text className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-brand-mist">
          Phone number
        </Text>
        <TextInput
          className="rounded-2xl border border-white/10 bg-black/35 px-4 py-4 text-[17px] text-white"
          placeholder="+250…"
          placeholderTextColor="rgba(148,163,184,0.65)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
      </View>

      <Pressable
        style={[layout.fabShadow, submitting ? { opacity: 0.85 } : null]}
        className="items-center justify-center rounded-3xl bg-emergency py-5 active:opacity-95"
        onPress={onCallForHelp}
        disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-[18px] font-bold tracking-wide text-white">Request help now</Text>
        )}
      </Pressable>

      {result ? (
        <View
          className={`rounded-2xl border px-4 py-4 ${
            ok ? "border-success/40 bg-success/20" : "border-red-400/35 bg-red-500/15"
          }`}>
          <Text className={`text-center text-[14px] leading-5 ${ok ? "text-emerald-50" : "text-red-100"}`}>
            {result}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function getLocationQuick(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    const done = (v: { latitude: number; longitude: number } | null) => resolve(v);
    const timer = setTimeout(() => done(null), 6000);
    Geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        done({ latitude: p.coords.latitude, longitude: p.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 },
    );
  });
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  secureTextEntry,
  passwordToggle,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "email-address";
  multiline?: boolean;
  secureTextEntry?: boolean;
  /** Eye-style show/hide when secureTextEntry is true */
  passwordToggle?: boolean;
}) {
  const [showSecret, setShowSecret] = useState(false);

  if (passwordToggle && secureTextEntry) {
    return (
      <View>
        <Text className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-brand-mist">{label}</Text>
        <View className="relative">
          <TextInput
            className="rounded-2xl border border-white/10 bg-black/30 py-3.5 pe-14 ps-4 text-[15px] text-white"
            placeholderTextColor="rgba(148,163,184,0.65)"
            placeholder={placeholder}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType ?? "default"}
            autoCapitalize={keyboardType === "email-address" ? "none" : undefined}
            secureTextEntry={!showSecret}
            autoCorrect={false}
          />
          <Pressable
            accessibilityLabel={showSecret ? "Hide password" : "Show password"}
            className="absolute bottom-0 end-0 top-0 w-12 items-center justify-center active:opacity-70"
            onPress={() => setShowSecret((v) => !v)}>
            <Text className="text-lg">{showSecret ? "🙈" : "👁"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-brand-mist">{label}</Text>
      <TextInput
        className={`rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-[15px] text-white ${multiline ? "min-h-[88px]" : ""}`}
        placeholderTextColor="rgba(148,163,184,0.65)"
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={keyboardType === "email-address" ? "none" : undefined}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}

function pickOpenAssignment(
  assignments: MyAssignment[],
  incidentId: string | undefined | null,
): MyAssignment | undefined {
  if (!incidentId) return undefined;
  return assignments.find((a) => a.incidentId === incidentId && !a.completedAt);
}

function AssignmentActionButtons({
  assignment,
  busy,
  onAccept,
  onArrive,
  onComplete,
}: {
  assignment: MyAssignment;
  busy: boolean;
  onAccept: () => void;
  onArrive: () => void;
  onComplete: () => void;
}) {
  if (assignment.completedAt) {
    return (
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400/90">Completed</Text>
    );
  }
  const accepted = Boolean(assignment.acceptedAt);
  const arrived = Boolean(assignment.arrivedAt);
  const base =
    "native:flex-1 items-center justify-center rounded-xl py-2.5 px-2 active:opacity-85 disabled:opacity-45";
  return (
    <View className="mt-3 flex-row flex-wrap gap-2">
      {!accepted ? (
        <Pressable className={`${base} bg-trust`} disabled={busy} onPress={onAccept}>
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-center text-[12px] font-bold text-white">Accept · en route</Text>
          )}
        </Pressable>
      ) : null}
      {accepted && !arrived ? (
        <Pressable className={`${base} bg-warning`} disabled={busy} onPress={onArrive}>
          {busy ? (
            <ActivityIndicator color="#1a1a1a" size="small" />
          ) : (
            <Text className="text-center text-[12px] font-bold text-neutral-dark">On scene</Text>
          )}
        </Pressable>
      ) : null}
      {accepted && arrived ? (
        <Pressable className={`${base} bg-success`} disabled={busy} onPress={onComplete}>
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-center text-[12px] font-bold text-white">Complete</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

function ResponderPanel({
  token,
  setToken,
  storageHydrated,
  onResponderLoggedIn,
  onResponderLoggedOut,
}: {
  token: string | null;
  setToken: (next: string | null) => void;
  storageHydrated: boolean;
  onResponderLoggedIn?: () => void;
  onResponderLoggedOut?: () => void;
}) {
  type SessionPhase = "idle" | "connecting" | "connected" | "denied";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("idle");
  const [sessionRetryKey, setSessionRetryKey] = useState(0);
  const [responderId, setResponderId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [lastAlert, setLastAlert] = useState<IncidentAlertPayload | null>(null);
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [activeAssignmentActionId, setActiveAssignmentActionId] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const prevOpenAssignmentIdsRef = useRef<Set<string> | null>(null);
  const lastIncidentAlertSoundIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

  const sessionConnected = sessionPhase === "connected";

  const refreshAssignments = useCallback(async () => {
    if (!token || !sessionConnected || !responderId) return;
    setAssignmentsLoading(true);
    try {
      const list = await fetchMyAssignments(token);
      const openIds = new Set(list.filter((a) => !a.completedAt).map((a) => a.assignmentId));
      const prev = prevOpenAssignmentIdsRef.current;
      if (prev !== null) {
        for (const id of openIds) {
          if (!prev.has(id)) {
            playIncidentAssignedFeedback();
            break;
          }
        }
      }
      prevOpenAssignmentIdsRef.current = openIds;

      setAssignments(list);
      setAssignmentError(null);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setAssignmentError(
          `${e.message} If this persists, open Sign out and sign in again — your session was kept.`,
        );
        return;
      }
      setAssignmentError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssignmentsLoading(false);
    }
  }, [token, sessionConnected, responderId]);

  const refreshAssignmentsRef = useRef(refreshAssignments);
  refreshAssignmentsRef.current = refreshAssignments;

  useEffect(() => {
    if (!token) {
      setResponderId(null);
      setOrgId(null);
      setSessionPhase("idle");
      setAssignmentError(null);
      unsubRef.current?.();
      unsubRef.current = null;
      prevOpenAssignmentIdsRef.current = null;
      lastIncidentAlertSoundIdRef.current = null;
      return;
    }
    let cancelled = false;
    setResponderId(null);
    setOrgId(null);
    setSessionPhase("connecting");
    setError(null);
    void (async () => {
      try {
        const [profile, me] = await Promise.all([fetchProfile(token), fetchMyResponder(token)]);
        if (cancelled) return;
        setOrgId(profile.organizationId);
        setResponderId(me.id);
        setSessionPhase("connected");
        if (profile.isResponder === false) {
          setError("This session is not a responder account. Sign out and sign in again.");
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof UnauthorizedError) {
          await AsyncStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setSessionPhase("idle");
          setError(e.message);
          onResponderLoggedOut?.();
          return;
        }
        setSessionPhase("denied");
        setError(e instanceof Error ? e.message : "Responder session invalid.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, sessionRetryKey, onResponderLoggedOut]);

  /** Proactively renew JWT before expiry (server-controlled TTL via JWT_EXPIRATION / jwt.expiration). */
  useEffect(() => {
    if (!token || !sessionConnected) return;
    let cancelled = false;
    /** Renew when less than this many ms remain on the access token. */
    const RENEW_THRESHOLD_MS = 25 * 60 * 1000;

    const maybeRenew = async () => {
      const t = tokenRef.current;
      if (!t || cancelled) return;
      const exp = decodeJwtExpMs(t);
      if (exp == null) return;
      if (exp - Date.now() > RENEW_THRESHOLD_MS) return;
      try {
        const next = await renewResponderSession(t);
        if (cancelled) return;
        await AsyncStorage.setItem(TOKEN_KEY, next);
        setToken(next);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof UnauthorizedError) {
          await AsyncStorage.removeItem(TOKEN_KEY);
          setToken(null);
          onResponderLoggedOut?.();
        }
      }
    };

    void maybeRenew();
    const id = setInterval(() => void maybeRenew(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, sessionConnected, setToken, onResponderLoggedOut]);

  useEffect(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    if (!token || !responderId) return;
    unsubRef.current = subscribeResponderAlerts(responderId, orgId, (payload) => {
      setLastAlert(payload);
    }, () => {
      void refreshAssignmentsRef.current();
    });
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [token, responderId, orgId]);

  /** Alert tone when a new incident message arrives over STOMP (assignment / proximity). */
  useEffect(() => {
    if (!sessionConnected || !lastAlert?.incidentId) return;
    const id = lastAlert.incidentId;
    const kind = lastAlert.type ?? "";
    const dedupeKey = `${kind}:${id}`;
    if (lastIncidentAlertSoundIdRef.current === dedupeKey) return;
    lastIncidentAlertSoundIdRef.current = dedupeKey;
    playIncidentAssignedFeedback();
  }, [lastAlert?.incidentId, lastAlert?.type, sessionConnected]);

  useEffect(() => {
    if (!token || !sessionConnected || !responderId) return;
    void refreshAssignments();
    const interval = setInterval(() => void refreshAssignments(), 20000);
    return () => clearInterval(interval);
  }, [token, responderId, sessionConnected, refreshAssignments]);

  useEffect(() => {
    if (!token || !sessionConnected || !responderId || !lastAlert?.incidentId) return;
    const t = setTimeout(() => void refreshAssignments(), 400);
    return () => clearTimeout(t);
  }, [lastAlert?.incidentId, token, responderId, sessionConnected, refreshAssignments]);

  useEffect(() => {
    if (!token || !sessionConnected) return;
    const id = setInterval(() => {
      Geolocation.getCurrentPosition(
        (pos) => {
          void updateResponderPosition(token, pos.coords.latitude, pos.coords.longitude).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 },
      );
    }, 45000);
    Geolocation.getCurrentPosition(
      (pos) => {
        void updateResponderPosition(token, pos.coords.latitude, pos.coords.longitude).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
    return () => clearInterval(id);
  }, [token, sessionConnected]);

  async function runAssignmentAction(
    kind: "accept" | "arrive" | "complete",
    assignmentId: string,
  ) {
    if (!token || !sessionConnected) return;
    setActiveAssignmentActionId(assignmentId);
    setAssignmentError(null);
    try {
      if (kind === "accept") await acceptAssignment(token, assignmentId);
      else if (kind === "arrive") await markAssignmentArrived(token, assignmentId);
      else await completeAssignment(token, assignmentId);
      await refreshAssignments();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setAssignmentError(
          `${e.message} You can try again or use Sign out if your session expired.`,
        );
        return;
      }
      setAssignmentError(e instanceof Error ? e.message : String(e));
    } finally {
      setActiveAssignmentActionId(null);
    }
  }

  async function onLogin() {
    setError(null);
    setLoginSubmitting(true);
    try {
      const session = await loginResponder(email.trim(), password);
      await AsyncStorage.setItem(TOKEN_KEY, session.accessToken);
      setToken(session.accessToken);
      onResponderLoggedIn?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function onLogout() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setResponderId(null);
    setOrgId(null);
    setLastAlert(null);
    setAssignments([]);
    setAssignmentError(null);
    setActiveAssignmentActionId(null);
    prevOpenAssignmentIdsRef.current = null;
    lastIncidentAlertSoundIdRef.current = null;
    setError(null);
    onResponderLoggedOut?.();
  }

  if (!storageHydrated) {
    return (
      <View className="items-center justify-center py-16">
        <ActivityIndicator size="large" color="#94a3b8" />
        <Text className="mt-4 text-[13px] text-brand-mist">Loading session…</Text>
      </View>
    );
  }

  if (!token) {
    return (
      <View className="gap-5">
        <View style={layout.cardShadow} className="rounded-3xl border border-white/10 bg-neutral-elevated p-5">
          <Text className="text-[15px] font-semibold text-white">Responder sign-in</Text>
          <Text className="mt-2 text-[14px] leading-5 text-brand-mist">
            Use the email and password for your responder account. Only users with an active responder profile can
            sign in here. Location is shared periodically for proximity alerts.
          </Text>
        </View>

        <View style={layout.cardShadow} className="gap-4 rounded-3xl border border-white/10 bg-neutral-card p-5">
          <LabeledInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@organization.com"
            keyboardType="email-address"
          />
          <LabeledInput label="Password" value={password} onChangeText={setPassword} secureTextEntry passwordToggle />
          <Pressable
            style={layout.cardShadow}
            className="mt-1 items-center rounded-2xl bg-trust py-4 active:opacity-90"
            disabled={loginSubmitting}
            onPress={onLogin}>
            {loginSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-[15px] font-bold text-white">Sign in</Text>
            )}
          </Pressable>
        </View>

        {error ? (
          <View className="rounded-2xl border border-red-400/35 bg-red-500/15 px-4 py-3">
            <Text className="text-center text-[13px] leading-5 text-red-100">{error}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (sessionPhase === "connecting") {
    return (
      <View
        style={layout.cardShadow}
        className="items-center gap-3 rounded-3xl border border-white/10 bg-neutral-card px-6 py-14">
        <ActivityIndicator size="large" color="#94a3b8" />
        <Text className="text-[15px] font-semibold text-white">Connecting…</Text>
        <Text className="text-center text-[13px] leading-5 text-brand-mist">
          Verifying your session with the RapidReach API (profile & responder profile).
        </Text>
      </View>
    );
  }

  if (sessionPhase === "denied") {
    return (
      <View className="gap-4">
        <View style={layout.cardShadow} className="rounded-3xl border border-red-400/35 bg-red-500/15 px-5 py-4">
          <Text className="text-[14px] font-semibold text-red-100">Could not verify responder session</Text>
          <Text className="mt-2 text-[13px] leading-5 text-red-100/90">{error}</Text>
          <Text className="mt-3 text-[11px] leading-4 text-red-200/80">
            Check network, API URL in settings, and that this account has an active responder profile.
          </Text>
        </View>
        <Pressable
          style={layout.cardShadow}
          className="items-center rounded-2xl bg-trust py-4 active:opacity-90"
          onPress={() => {
            setSessionRetryKey((k) => k + 1);
          }}>
          <Text className="text-[15px] font-bold text-white">Try again</Text>
        </Pressable>
        <Pressable
          className="items-center rounded-2xl border border-white/15 py-3 active:opacity-80"
          onPress={onLogout}>
          <Text className="text-[14px] font-semibold text-white">Sign out</Text>
        </Pressable>
      </View>
    );
  }

  const openAssignments = assignments.filter((a) => !a.completedAt);
  const alertAssignment = pickOpenAssignment(assignments, lastAlert?.incidentId);

  return (
    <View className="gap-5">
      <View className="flex-row flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/35 bg-success/15 px-4 py-3">
        <View className="flex-row items-center gap-2">
          <View className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <Text className="text-[13px] font-semibold text-emerald-50">Signed in · location tracking</Text>
        </View>
        <Pressable
          className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 active:opacity-80"
          onPress={onLogout}>
          <Text className="text-[12px] font-semibold text-white">Sign out</Text>
        </Pressable>
      </View>

      <View style={layout.cardShadow} className="rounded-3xl border border-white/10 bg-neutral-card p-5">
        <Text className="text-[11px] font-semibold uppercase tracking-wider text-brand-mist">Alerts</Text>
        <Text className="mt-2 text-[13px] leading-5 text-white/90">
          Live dispatch notifications are on. You’ll get vibration and a short tone when a relevant incident is sent to
          your unit.
        </Text>
        <Text className="mt-2 text-[11px] leading-4 text-brand-mist">
          {orgId
            ? "Includes proximity alerts and your organization’s incident channel when available."
            : "Proximity alerts use your last shared GPS position."}
        </Text>
      </View>

      {error ? (
        <View className="rounded-2xl border border-amber-400/35 bg-amber-500/15 px-4 py-3">
          <Text className="text-[13px] leading-5 text-amber-50">{error}</Text>
        </View>
      ) : null}

      <View style={layout.cardShadow} className="rounded-3xl border border-white/10 bg-neutral-elevated p-5">
        <View className="mb-3 flex-row items-center justify-between gap-2">
          <Text className="text-[16px] font-bold text-white">My assignments</Text>
          <Pressable
            className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 active:opacity-80"
            onPress={() => void refreshAssignments()}
            disabled={assignmentsLoading || !sessionConnected}>
            <Text className="text-[11px] font-semibold text-white">
              {assignmentsLoading ? "…" : "Refresh"}
            </Text>
          </Pressable>
        </View>
        {assignmentError ? (
          <View className="mb-3 rounded-xl border border-red-400/35 bg-red-500/15 px-3 py-2">
            <Text className="text-[12px] leading-5 text-red-100">{assignmentError}</Text>
          </View>
        ) : null}
        {openAssignments.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-white/15 py-8">
            <Text className="text-[13px] text-brand-mist">No open dispatches</Text>
            <Text className="mt-1 px-4 text-center text-[11px] text-white/40">
              When a coordinator assigns you to an incident, it appears here. Use Refresh after an alert.
            </Text>
          </View>
        ) : (
          openAssignments.map((a) => (
            <View
              key={a.assignmentId}
              className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4 last:mb-0">
              <Text className="text-[13px] font-semibold text-white">
                {a.referenceNo ?? a.incidentId.slice(0, 12)}
              </Text>
              <Text className="mt-1 text-[12px] text-brand-mist">{a.emergencyTypeName ?? "Incident"}</Text>
              <Text className="mt-1 text-[11px] text-white/50">
                Assignment {a.assignmentStatus ?? "—"} · Incident {a.incidentStatus ?? "—"}
              </Text>
              {a.address ? (
                <Text className="mt-2 text-[12px] leading-5 text-white/75">{a.address}</Text>
              ) : null}
              <AssignmentActionButtons
                assignment={a}
                busy={activeAssignmentActionId === a.assignmentId}
                onAccept={() => void runAssignmentAction("accept", a.assignmentId)}
                onArrive={() => void runAssignmentAction("arrive", a.assignmentId)}
                onComplete={() => void runAssignmentAction("complete", a.assignmentId)}
              />
            </View>
          ))
        )}
      </View>

      <View style={layout.cardShadow} className="rounded-3xl border border-white/10 bg-neutral-elevated p-5">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[16px] font-bold text-white">Latest alert</Text>
          {lastAlert?.incidentId ? (
            <View className="rounded-full bg-emergency/25 px-2.5 py-1">
              <Text className="text-[10px] font-bold uppercase tracking-wide text-emergency">Live</Text>
            </View>
          ) : null}
        </View>
        {lastAlert?.incidentId ? (
          <View className="rounded-2xl border-l-4 border-emergency bg-black/25 pl-4 pr-3 py-3">
            <Text className="text-[13px] font-semibold text-white">
              {lastAlert.referenceNo ?? lastAlert.incidentId.slice(0, 12)}
            </Text>
            <Text className="mt-1 text-[13px] text-brand-mist">{lastAlert.emergencyTypeName ?? "Incident"}</Text>
            {lastAlert.distanceKm != null ? (
              <Text className="mt-2 text-[12px] text-emergency">~{lastAlert.distanceKm.toFixed(1)} km away</Text>
            ) : null}
            {lastAlert.address ? (
              <Text className="mt-2 text-[12px] leading-5 text-white/80">{lastAlert.address}</Text>
            ) : null}
            {alertAssignment ? (
              <AssignmentActionButtons
                assignment={alertAssignment}
                busy={activeAssignmentActionId === alertAssignment.assignmentId}
                onAccept={() => void runAssignmentAction("accept", alertAssignment.assignmentId)}
                onArrive={() => void runAssignmentAction("arrive", alertAssignment.assignmentId)}
                onComplete={() => void runAssignmentAction("complete", alertAssignment.assignmentId)}
              />
            ) : (
              <Text className="mt-3 text-[11px] leading-4 text-white/45">
                Assignment not synced yet — open “My assignments” above or tap Refresh once dispatch assigns you.
              </Text>
            )}
          </View>
        ) : (
          <View className="items-center rounded-2xl border border-dashed border-white/15 py-10">
            <Text className="text-[13px] text-brand-mist">Waiting for alerts…</Text>
            <Text className="mt-1 px-6 text-center text-[11px] text-white/40">
              Stay signed in; incidents near you appear here.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default App;
