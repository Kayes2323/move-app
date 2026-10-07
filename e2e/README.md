# End-to-end checks

`npm run e2e` starts `next dev` with `E2E=1` and drives headless Chromium through the tracking, offline and sync flows.
With `E2E=1`, `next.config.ts` swaps the Firebase SDK for the in-memory stand-ins in `e2e/mocks/`, so no account or network
is needed. Run one scenario with `node e2e/run.mjs <name>` (navigation, lock, pause, offline, syncFailures, crash,
permissions, backgroundFinish, regression). Needs Chromium (`CHROMIUM_PATH`, default `/opt/pw-browsers/chromium-1194/...`).

## What this proves
The app's own logic: timestamps, pause accounting, gap handling, local persistence, crash recovery, offline finish,
sync ordering, retry, and that syncing twice cannot count an activity twice.

## What it does NOT prove
* Real GPS or real background behaviour. A browser test cannot lock a phone: "background" is simulated by hiding the page,
  moving the test clock, and withholding fixes.
* Real Firestore behaviour (rules, transaction semantics, offline cache). The stand-in is a model.
* Anything native (foreground service, notification, battery). See `docs/NATIVE.md`.
