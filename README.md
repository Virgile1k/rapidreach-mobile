# RapidReach Mobile

Standalone **React Native 0.85** app for RapidReach: SOS flows, incidents, responder experience, maps (MapLibre), and API integration.

This README assumes this codebase lives in **its own Git repository** (e.g. `rapidreach-mobile`). The backend API is a **separate** service.

## Backend API

The app calls the RapidReach REST API. Base URL is set in **`src/config.ts`**:

| Constant | Purpose |
|----------|---------|
| `PRODUCTION_API_BASE` | Deployed API, e.g. `https://rapidreachbn.nexvsoft.com` |
| `USE_LOCAL_BACKEND` | `true` to develop against a machine on your network |
| `DEV_MACHINE_HOST` | Hostname or IP for dev API (use **`10.0.2.2`** on Android emulator to reach the host’s `localhost`) |

**Example hosted API:** [https://rapidreachbn.nexvsoft.com/](https://rapidreachbn.nexvsoft.com/)

## Emergency calling (real incidents)

The app may guide or simulate workflows; it does **not** replace dialing emergency services. For immediate danger, call your **local** emergency number (e.g. **112**, **911**, or **999** depending on country).

## Demo / test users (local or seeded backend)

Use these only when your API exposes the same accounts:

| Role | Email | Password |
|------|--------|----------|
| Super admin | `admin@rapidreach.com` | `password` |
| Responder (mobile responder experience) | `responder@rapidreach.com` | `password` |

## Requirements

- **Node.js ≥ 20**
- **Android:** Android SDK, JDK, emulator or device
- **iOS (macOS):** Xcode, CocoaPods (see [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment))

## Clone & setup

```bash
git clone <your-mobile-repository-url>
cd <repository-root>
npm install
```

Adjust `src/config.ts` for your backend URL, then:

```bash
npm start
```

In another terminal:

```bash
npm run android    # Android
npm run ios        # iOS (macOS only)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Metro bundler |
| `npm run android` | Run on Android |
| `npm run ios` | Run on iOS |
| `npm test` | Jest |
| `npm run lint` | ESLint |
| `npm run build:android` | Release APK/AAB (Gradle) |

## Launcher icons (optional)

```bash
npm run icons
```

Uses Python 3: `tools/generate_launcher_icons.py`.

## Related

- **Backend API:** separate repo — must be reachable from the device/emulator (correct host, HTTPS in production, CORS not required for native app).
- **Web dashboard:** separate repo — operators use the Next.js app; field users use this mobile app.
