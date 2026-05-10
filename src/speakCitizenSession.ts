import Tts from "react-native-tts";
import { Platform } from "react-native";

let preparePromise: Promise<void> | null = null;

/** Must resolve before {@link speakCitizenSessionLine} works reliably on Android (and helps on iOS). */
export function prepareCitizenTts(): Promise<void> {
  if (!preparePromise) {
    preparePromise = (async () => {
      await Tts.getInitStatus();
      if (Platform.OS === "ios") {
        await Tts.setIgnoreSilentSwitch("ignore");
      }
      try {
        const raw =
          typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().locale : "en-US";
        const lang = raw.replace(/_/g, "-").split("@")[0].trim() || "en-US";
        await Tts.setDefaultLanguage(lang);
      } catch {
        await Tts.setDefaultLanguage("en-US");
      }
    })().catch((err) => {
      preparePromise = null;
      throw err;
    });
  }
  return preparePromise;
}

/** Reads text aloud after ensuring the native engine is ready (promise chain). */
export function speakCitizenSessionLine(text: string): void {
  const line = text.trim();
  if (!line) return;

  void prepareCitizenTts()
    .then(() => Tts.stop())
    .then(() => Promise.resolve(Tts.speak(line)))
    .catch((e) => {
      if (__DEV__) {
        console.warn("[CitizenTTS] speak failed:", e);
      }
    });
}
