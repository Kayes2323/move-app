# Routes: journey progress, milestones, map provider, images

## Root causes found (audit of the code as deployed at `591a33f`)

1. **Journey started "from Hajiganj".** `JourneyDetail` asked the phone for one GPS fix and called `findNearestCheckpoint`, which returns the nearest
   checkpoint **at any distance** (a user anywhere in Bangladesh got "We found you near X"), with that choice as the highlighted primary button.
   Tapping it saved `startCheckpointIndex = <Hajiganj>` for good. Only the *map/screen labels* then said Hajiganj; the run screen and Home kept saying
   "Dhaka → Chandpur" because they ignored `startCheckpointIndex`. There is no hardcoded Hajiganj origin anywhere: the route data lists Hajiganj as the
   6th Chandpur checkpoint, and the nearest-checkpoint rule picked it for a user who was physically there.
2. **Territory walks never moved the Journey.** By the earlier "separation" design only a move started in Route mode carried the journey. The
   engine dropped the journey for Territory moves and sync only credited `JOURNEY` moves.
3. **Switching journeys destroyed progress** (`completedKm: 0` on every switch, with a confirm that said so). A move waiting to sync for the old journey
   was silently dropped (the name/start check no longer matched).
4. **"API key required".** The maps used CARTO basemaps (`basemaps.cartocdn.com`). CARTO now answers with a watermark tile ("API KEY REQUIRED") with
   HTTP 200, so no `tileerror` fires and the map looks loaded. Confirmed on a real phone (screenshot), not reproducible from the build sandbox (no outbound
   route to tile servers). It affected the live map, the journey map and the Territory maps.
5. **Slow Routes page.** The list loaded eight original JPEGs of 0.6–3.7 MB each (15.9 MB), all with `Cache-Control: public, max-age=0` (revalidated on
   every visit), no width/height, in a page that only showed the list after the same scripts loaded. Measured before: 14 image requests / 13.7 MB over two
   loads; on 1.5 Mbps / 150 ms the page's `load` event did not fire within 30 s.

## What changed

| Area | Change |
| --- | --- |
| Journey origin | "Near X" is only offered within 5 km of a checkpoint (`journeyStart.ts`); the **whole journey from Dhaka is the primary choice**; every screen names the real origin (`journeyOriginName`). A journey is a **distance journey**: progress = recorded km since it was started, never derived from the map or from where the phone is. `startCheckpointIndex` only says how many km are left. |
| Progress sources | Route **and** Territory moves carry the journey, so one valid activity feeds both features by their own rules, once (the activity document is created in the same transaction as the credit). Free moves carry none. |
| Switching | `journeySwitch.ts`: leaving a journey saves it under `users/{uid}.journeyProgress.{routeId}`; resuming restores km, start and milestones. A late-syncing activity credits the saved copy of *its* journey, matched by `journeyId`. Starting over is explicit. |
| Milestones | `app/data/milestones.ts` (editable config) + `journeyMilestones.ts` (pure evaluator) + `useJourneyMilestones.ts` + in-app toast. Event ids are `{journeyId}:km:N`, `{journeyId}:at:{checkpoint}`, `{journeyId}:complete`; remembered locally and on `users/{uid}.journeyMilestones`. |
| Routes page | Header → your journey → journey list → map. The map mounts only when scrolled near, has a fixed height, an error state with Try again, and never blocks the list. Journey detail: progress, checkpoints, then map. |
| Maps | One tile source (`app/lib/mapTiles.ts`), key-free OpenStreetMap by default, configurable by env, attribution always shown, honest loading/error. |
| Images | `tools/route-images/build.mjs` → WebP 720/1280 px with content-hashed names (`public/images/routes`), `app/data/route-images.json`, `RouteImage` (srcset, width/height, lazy, first one eager), `Cache-Control: immutable` for a year. Originals are untouched. |

## Milestones: what is real and what is not

* **Distance milestones** (every 5 km of recorded journey distance, plus completion) say nothing about location.
* **Arrival milestones** only exist for places whose coordinates were *checked*. Checked (Wikipedia infobox, 1 arc-minute precision, so the radius is generous):
  Jatrabari (23.7105 N, 90.4355 E, 1.5 km) and Hajiganj (23.250 N, 90.850 E, 2.5 km). **Not checked and therefore not active:** Kanchpur, Mograpara,
  Gouripur, Chandpur. **Kachua is wrong in `routes.ts`**: Wikipedia puts it near 23.350 N 90.883 E, `routes.ts` has 23.3333 N 90.7667 E, about 12 km
  apart. That checkpoint also draws the route lines and the nearest-checkpoint offer, so it should be corrected. Narayanganj is not a checkpoint on the
  Chandpur route in the data; nothing was invented for it.
* To add a milestone: verify the coordinates against a source, add one entry to `ARRIVAL_MILESTONES` with `source`. Nothing else changes.
* Arrival needs two consecutive fixes inside the radius, each ≤ 50 m accurate, real movement on this move (≥ 50 m), and the place must be *after* where the
  journey started. A phone standing still next to a place is not an arrival.
* Notifications are **in-app only** (a toast while Move is open). Background/push notifications are not set up: that needs the native app
  (foreground service) and a push provider (FCM/APNs). On the web, browsers pause GPS when the screen locks, so a milestone is shown when Move is open.

## Map provider, key and billing

* Default: `tile.openstreetmap.org`, no key. OSM's tile policy allows **light** use with attribution and forbids heavy/bulk use; it is fine for testing and
  a small user base, **not** for scale. Ours always shows the "© OpenStreetMap contributors" attribution.
* For production scale pick a keyed provider and set, in Vercel → Project → Settings → Environment Variables (Production **and** Preview):
  * `NEXT_PUBLIC_MAP_TILE_URL`, e.g. `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=YOUR_KEY`
  * `NEXT_PUBLIC_MAP_ATTRIBUTION`, the provider's required attribution as HTML.
  * Restrict the key to your domains in the provider dashboard (a browser key is public by design). Check the provider's free tier and billing before enabling.
  Nothing is billed unless you create that account/key. Without the variables the app uses OSM and keeps working.
* The Capacitor (static) build reads the same variables at build time.
