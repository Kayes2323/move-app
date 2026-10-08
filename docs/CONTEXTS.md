# Journey, Territory and free moves are three different things

Move has three product contexts. They never share state, and none is inferred from another.

| Context | Owns | Saved in |
| --- | --- | --- |
| **Journey** (the virtual route, Dhaka → X) | the route the user chose, how far along it they are | `users/{uid}`: `currentRoute`, `completedKm`, `startCheckpointIndex` (read only through `lib/journey.ts`) |
| **Territory** (real geography) | the active Territory, its coverage, the Kings | `users/{uid}`: `territoryActive`, `territory`, `territoryParked`; `territories/{areaId}` |
| **Tracking** (actual movement) | the move itself: GPS, time, distance, and why it was made | the local activity, then `users/{uid}/activities/*` and `runs` |

## Why are you moving? (`lib/activityMode.ts`)
`NORMAL` (a free move), `JOURNEY` (follow a route) or `TERRITORY` (explore the active Territory). The user chooses on **Start moving**
(a sheet with ROUTE and TERRITORY, plus a quiet "free move"); it is saved with the move and read from the move everywhere after (live
screen, sync, share cards). A move never carries another mode's context: the engine drops the Journey from a Territory or free move.
Moves saved before modes existed are `JOURNEY` if they carried a journey, else `NORMAL`.

* **ROUTE** continues the user's Journey; with none, it goes to the routes to choose from. Nothing picks a route for the user.
* **TERRITORY** needs a chosen Territory: none → Choose Territory; chosen but not open yet → its Not Open screen (no credit, nothing starts); open → a Territory move.
* Only a `JOURNEY` move advances `completedKm`. Totals, streak and the leaderboard count every move.
* The live screen follows the move's own mode: Journey draws the route; Territory draws Territory (and says so if it cannot load; it never falls back to a route); a free move draws neither.
* A share card uses the route the move was recorded on (`routeName`), never the user's *current* Journey.

## The bug this fixed
`/run` was one screen for everything. It attached the user's Journey (every new account was seeded with `currentRoute: "Chandpur"`) to every move,
and drew the route whenever the Territory view was not (yet) available, so Territory showed the Chandpur route (and its "Next · checkpoint"),
Territory moves silently advanced the Journey, and old share cards took whatever the user's current Journey was.

## Rules kept by tests (`lib/separation.test.ts`, E2E `separation`)
No default or fallback route anywhere; `currentRoute` is read only by Journey code; Territory code never touches the Journey; the Territory and
free-move live views never draw a route; a Territory move is saved with its Territory and no Journey.
