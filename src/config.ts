import { Platform } from "react-native";

export const PRODUCTION_API_BASE = "https://rapidreachbn.nexvsoft.com";

export const USE_LOCAL_BACKEND = false;

export const DEV_MACHINE_HOST = "";

export const FALLBACK_EMERGENCY_TYPE_ID = "";

const DEV_PORT = 4300;

function resolveDevApiBase(): string {
  const host = DEV_MACHINE_HOST.trim();
  if (host.length > 0) {
    return `http://${host}:${DEV_PORT}`;
  }
  if (Platform.OS === "android") {
    return `http:
  }
  return `http://localhost:${DEV_PORT}`;
}

export const API_BASE = USE_LOCAL_BACKEND ? resolveDevApiBase() : PRODUCTION_API_BASE;
