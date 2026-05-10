import Tts from "react-native-tts";

/** Best-effort TTS for automated dispatch lines (requires native `react-native-tts` linked build). */
export function speakCitizenSessionLine(text: string): void {
  const line = text.trim();
  if (!line) return;
  try {
    Tts.stop();
    void Tts.speak(line);
  } catch {
    /* Native module unavailable or engine error — UI still shows the text. */
  }
}
