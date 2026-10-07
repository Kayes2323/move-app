# Background tracking: platform findings and the native path

## What Move is today
A Next.js web app (PWA manifest, no service worker, no Capacitor / Expo / React Native). In a browser the Geolocation
API only delivers positions while the page is visible; when the screen locks or another app is in front, delivery stops
(on iOS completely), and service workers cannot read location. **No amount of JavaScript can make a web page a reliable
background GPS tracker.** Move therefore tracks in two modes behind one interface (`app/lib/tracking/location.ts`):

| | Web (today) | Native shell (Capacitor + `@capacitor-community/background-geolocation`) |
|---|---|---|
| Screen locked / other app in front | GPS paused by the browser. Move detects the gap, asks whether the time counts, and flags the route | Android foreground service keeps delivering fixes |
| Notification | none | required by Android; fixed text ("Move is tracking your walk"), tapping opens Move |
| Live distance/time in notification, Pause/Finish buttons | no | **not supported by this plugin** (the text is set once; no actions) |
| Works from a cold start with no network | only if the page is already cached (there is no service worker) | yes: the static export ships inside the app |

Everything else (local storage, timestamps, pause accounting, crash recovery, offline finish, idempotent sync) lives in
`app/lib/tracking/` and is identical in both modes, because the *activity* is a record in IndexedDB, not UI state.

## Architecture
```
location source (web | native)  ->  TrackingEngine  ->  IndexedDB (activities + points, one atomic write per point)
                                         |                       |
                                    UI subscribes          SyncManager -> Firestore (idempotent transaction)
```
* Time = sum of active segments from timestamps. Pause closes a segment; nothing is derived from timer ticks.
* A fix is accepted by accuracy, jitter (compared with the last *accepted* point, so slow movement isn't lost),
  a stale/duplicate check, and an accuracy-aware speed check (generous limits: 12 / 32 / 70 km/h).
* Crash recovery: the open segment is closed at the last heartbeat (`lastSeenAt`), so time the app was dead is not counted.
* Sync: `users/{uid}/activities/{activityId}` (+ `tracks/{n}` chunks of 1000 points, flat arrays because Firestore forbids
  nested ones). One transaction creates the activity and applies totals/streak; if the activity document exists, nothing is
  counted again. Local data is deleted only after the server confirmed it.
* The legacy `users/{uid}.runs[]` entry is still written in the same transaction so Home / Profile / Share keep working.
  Moving those screens to the activities collection is the next step; the array will eventually hit Firestore's 1 MB limit.

## Building the native app (not done or tested in this repository)
Needs Android Studio / SDK and a physical device.
1. Decide `appId` in `capacitor.config.ts` (`bd.move.app` is a placeholder; it is permanent once published).
2. `npm i @capacitor/android` and `npx cap add android`.
3. `npm run build:static && npx cap sync android` (static export to `out/`).
4. The plugin merges these permissions itself (read from its manifest): `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
   `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, and declares a `location` foreground service.
5. iOS (not attempted): `Info.plist` keys `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`
   and `UIBackgroundModes: location`.

### Blockers to resolve before a native build is usable
* **Google sign-in.** `signInWithPopup` does not work inside a native WebView (Google rejects embedded browsers). The native app
  needs a native Google sign-in (for example `@capacitor-firebase/authentication`), a `google-services.json`, and the app's
  SHA-1 registered in Firebase. Until then a native build cannot log in.
* **Google Play policy.** Foreground location services require a declaration in Play Console; verify the current requirements.
* **Android 13+ notifications.** The plugin documents that `POST_NOTIFICATIONS` is needed to show the notification. What happens
  to tracking when the user refuses it was not verified.
* **Battery optimisation.** Some manufacturers (Xiaomi, Oppo, Vivo, Huawei, Samsung) kill background services regardless. Needs
  device testing; users may have to exempt Move from battery optimisation.
* **JS in the background.** Location callbacks run in the WebView's JavaScript. If the OS freezes or kills the WebView while the
  service lives on, fixes in that window are lost (the plugin does not buffer natively). Verify on devices; if it happens, the
  fix is a native-side buffer, i.e. a different plugin or custom code.
* Static export drops the Vercel-only features; there are none today, but the web deployment is unchanged.

## Device test plan (none of these has been run on a device)
1. Start -> Home -> return
2. Start -> another app -> return
3. Start -> lock screen, walk 10 min -> unlock
4. Start -> airplane mode -> walk -> finish (result shows)
5. ... -> reconnect -> activity syncs once
6. Start -> background -> force UI recreation (rotate / low-memory)
7. Permission denied, then granted from Settings
8. Tunnel / indoor GPS loss
9. Pause -> background -> resume
10. Start -> background -> finish from the notification (tap opens Move)
11. Sync the same activity twice (airplane mode toggled during sync)
12. Firebase unreachable during sync
13. Battery use over a 60 minute walk on at least two manufacturers
