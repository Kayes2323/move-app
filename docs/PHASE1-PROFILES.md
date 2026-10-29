# Phase 1: Google sign-in, athlete profiles, Territory explorers

## 1. What already existed (audit)
* **Auth**: Firebase Auth, Google popup only (`app/login`). No second auth system was added.
* **Accounts**: `users/{uid}` (private). `publicProfiles/{uid}` (name, photo, totals) for the leaderboard.
* **Territory ownership**: `territories/{areaId}`: the **King**. First to explore >= the area's threshold (40-80% of eligible cells) conquers (reign 1); a challenger takes over with 2x the requirement in credits (<= 2 per cell, 2nd on another day) earned since the reign began. Transactional, append-only `events/{reign}`; rules in `firestore.rules`.
* **Activity processing**: idempotent per activity id; GPS validation, hidden eligible cells, no back-fill, no cycling. Activity **distance is deliberately not used** in Territory.
* **Not present**: Firebase Storage, usernames, bio, height, BMI, privacy controls, explorers list, ownership history UI, permanent achievements.

## 2. Reconciling "distance-based ownership score" with the cell model
They are different metrics, so they are **modelled and shown separately** and the King rules are untouched:

| | Metric | Used for |
| --- | --- | --- |
| Eligible-cell exploration | validated, de-duplicated cells | conquest, takeover (unchanged), and the new explorers ranking |
| Distance | km of the activity | profile totals / leaderboard only; **not** in Territory |

Why distance is not simply the score: walking the same lane 100 times would farm it. Any anti-farm cap per cell turns distance back into "credits per cell", which is what takeover already uses. Making ownership "highest score wins" is therefore an **open product decision** (section 8). Until it is made, the Owner card shows the real King, and the explorers list shows real cell counts next to it. The list can show someone ahead of the King; that does not change ownership.

## 3. Data model
```
users/{uid}                 PRIVATE  name, photo(Google), photoCustom, username, bio, heightCm, weight, privacy{showInTerritory,showUsername,showBio}
publicProfiles/{uid}        PUBLIC   name, photo, username, bio, totalKm, streak, updatedAt   (never height/weight/BMI)
usernames/{handle}          PUBLIC   {uid, at}  one doc per taken username
territories/{a}/explorers/{uid}      {uid,name,photo,username,exploredCells,requiredCells,moves,lastGainAt,updatedAt}
territories/{a}/events/{reign}       (existing) ownership history
territoryAchievements/{a}   PUBLIC   permanent "Territory Conquered": first conqueror, create-only
```
Defaults for old accounts: missing fields read as empty, privacy defaults to what was already public (name + photo). Nothing is migrated destructively; the Google photo is refreshed at sign-in, an edited name is never overwritten, an uploaded photo always wins.

## 4. Rules for the new behaviour
* **Profile picture**: uploaded > Google > initials. Upload is resized client-side (512 px JPEG, <= 400 KB); failure leaves the old picture and says why.
* **Username**: 3-20 chars `[a-z0-9_]`, starts with a letter, reserved words refused, unique through `usernames/{handle}` reserved in the same transaction as the profile (a race loses cleanly).
* **Fitness details optional**; BMI = kg/m² shown only to the owner; removing weight no longer sends anyone back to onboarding.
* **Privacy**: height/weight/BMI/email never leave `users/{uid}`; `publicFields()` is an allow-list and the rules reject extra keys. "Show me in Territory" off => public profile is "Move athlete" with no photo/username/bio, and no explorer entry.
* **Explorers**: each person's entry is a *projection* of their own validated coverage, written as an absolute value (not an increment) => duplicate sync, retry, restart, two devices all leave the same number. Repeating a route adds no cells, so adds nothing.
* **Ranking**: more cells; tie => who reached that count first (`lastGainAt`); then smaller uid. Deterministic, order-independent (tested over 200 shuffles).
* **Stale / invalid GPS**: handled upstream by the existing validation; invalid tracks add no cells. Cycling and pre-selection activity add nothing.
* **Concurrency**: explorer docs are per-user (no shared counter). King changes stay in the existing transaction. Username claims are transactional.
* **Territory Conquered**: created once in the conquest transaction (rules require the reign-1 event to name you), never updated or deleted, unaffected by takeovers. Existing Kings get theirs lazily from their existing conquest event.
* **Live GPS is never published**; boards show names, pictures and counts only. Pictures load lazily after the core Territory page.

## 5. Setup you must do (nothing here is automatic)
1. **Publish `firestore.rules`** (Firebase console > Firestore > Rules). Without it the new reads/writes are denied; the app degrades (board shows "can't be shown", profile save errors) and the existing Territory keeps working only if the old rules were already published.
2. **Enable Firebase Storage** (console > Storage) and publish **`storage.rules`**. Until then, uploads fail with "Picture uploads aren't switched on" and the Google photo stays. Note: Google may require the Blaze (pay-as-you-go) plan to create a default bucket on newer projects; check before relying on uploads.
3. Google provider is already enabled (login works today). No new OAuth setup.
4. No data migration to run.

## 6. Verification
`npm test` (269 unit), `tools/firestore-rules/rules.test.mjs` (39 checks against the real Firestore emulator), `npm run e2e -- profile` (49 checks), typecheck, lint, builds: see the report.

## 7. Known limits
* Explorer counts and claim proofs are computed on the phone. Rules bound and sanity-check them, but a modified client could forge them. Real authority needs a Cloud Function recomputing from stored tracks.
* "First to complete" = first successful, recorded conquest, not the earliest GPS timestamp.
* Not verified: real Google popup, real Firebase Storage, real devices, real production data.

## 8. Decisions for the product owner
1. Should Territory ownership become "highest score wins"? If yes, what score: cells (credits), capped distance, or a mix, and with what daily/per-cell cap to stop route farming?
2. Default visibility: today name + photo are public by default (as the leaderboard already was). Make it opt-in instead?
3. Allow users to *choose* to publish BMI? Not offered in Phase 1.
4. Show explorers inactive for N days differently?
