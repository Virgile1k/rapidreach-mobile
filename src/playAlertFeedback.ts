import { Vibration } from "react-native";

let lastPlayAt = 0;

const DEBOUNCE_MS = 10_800;


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


export function playIncidentAssignedFeedback(): void {
  const now = Date.now();
  if (now - lastPlayAt < DEBOUNCE_MS) return;
  lastPlayAt = now;

  clearStopSoundTimer();

  try {
    Vibration.vibrate([0, 350, 120, 350, 120, 400]);
  } catch {
    
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
        
      }
    }, ALERT_SOUND_DURATION_MS);
  } catch {
    
  }
}
