import { Platform } from "react-native";

/**
 * Deployed Spring API (no trailing slash).
 * Used whenever {@link USE_LOCAL_BACKEND} is false (default — including Metro “local” dev).
 */
export const PRODUCTION_API_BASE = "https://rapidreachbn.nexvsoft.com";

/**
 * Set to `true` only when rapidreach-bn runs on your PC and the app should call it directly
 * (Android emulator → 10.0.2.2:4300, iOS simulator → localhost:4300, or {@link DEV_MACHINE_HOST}).
 *
 * Leave `false` so **local Metro dev still hits the hosted** backend ({@link PRODUCTION_API_BASE}).
 */
export const USE_LOCAL_BACKEND = false;

/**
 * When testing on a **physical phone** with {@link USE_LOCAL_BACKEND} `true`, set this to your PC's LAN IP.
 * Example: `"192.168.1.42"`
 */
export const DEV_MACHINE_HOST = "";

/**
 * If the API returns no emergency types (empty DB) but you know a valid UUID from admin/Swagger,
 * paste it here so SOS still works. Leave empty to require types from the server.
 */
export const FALLBACK_EMERGENCY_TYPE_ID = "";

const DEV_PORT = 4300;

function resolveDevApiBase(): string {
  const host = DEV_MACHINE_HOST.trim();
  if (host.length > 0) {
    return `http://${host}:${DEV_PORT}`;
  }
  if (Platform.OS === "android") {
    return `http://10.0.2.2:${DEV_PORT}`;
  }
  return `http://localhost:${DEV_PORT}`;
}

/**
 * REST API base — no trailing slash.
 */
export const API_BASE = USE_LOCAL_BACKEND ? resolveDevApiBase() : PRODUCTION_API_BASE;
