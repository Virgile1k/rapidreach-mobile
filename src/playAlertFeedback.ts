import { Vibration } from "react-native";

let lastPlayAt = 0;
/** Longer than alert audio tail so overlapping coordinator actions do not stack tones. */
const DEBOUNCE_MS = 10_800;

/** Mixkit preview (~2s); we loop until {@link ALERT_SOUND_DURATION_MS}. */
const ALERT_SOUND_URL =
  "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

const ALERT_SOUND_DURATION_MS = 10_000;

let stopSoundTimer: ReturnType<typeof setTimeout> | null = null;

function clearStopSoundTimer(): void {
  if (stopSoundTimer != null) {
    clearTimeout(stopSoundTimer);
    stopSoundTimer = null;
  }
}

/**
 * Haptic + looping alert tone (~10s) when a responder receives a dispatch / incident alert.
 * Debounced so WS bursts or REST refresh do not spam.
 */
export function playIncidentAssignedFeedback(): void {
  const now = Date.now();
  if (now - lastPlayAt < DEBOUNCE_MS) return;
  lastPlayAt = now;

  clearStopSoundTimer();

  try {
    Vibration.vibrate([0, 350, 120, 350, 120, 400]);
  } catch {
    // Missing VIBRATE in manifest or device without vibrator — continue with sound if available
  }

  try {
    const SoundPlayer = require("react-native-sound-player").default as {
      playUrl: (url: string) => void;
      stop: () => void;
      setNumberOfLoops: (loops: number) => void;
    };
    SoundPlayer.stop();
    SoundPlayer.setNumberOfLoops(-1);
    SoundPlayer.playUrl(ALERT_SOUND_URL);
    stopSoundTimer = setTimeout(() => {
      stopSoundTimer = null;
      try {
        SoundPlayer.stop();
      } catch {
        /* noop */
      }
    }, ALERT_SOUND_DURATION_MS);
  } catch {
    // react-native-sound-player not linked — vibration only
  }
}
