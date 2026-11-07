# MOVE vs Strava: what exists, what's next

Strava's source code is not public, so "following Strava's code" is not possible. This compares against Strava's publicly visible
features and builds MOVE's own version of each, in MOVE's look.

| Strava feature | MOVE today | Next step |
| --- | --- | --- |
| GPS recording (walk/run/ride), pause, background | Yes (web: browser pauses GPS when the screen is off; native app planned) | Native Android build (Capacitor) for reliable background GPS |
| Live map with your track | Yes (OSM streets / Esri satellite) | Google Maps tiles when a Maps key is provided (see below) |
| Share cards / photo stickers | Yes: route, normal, Territory cards; **new** photo story card with the route on the ground, transparent sticker | Video-style animated route |
| Activity detail: splits per km, best efforts, elevation | Partial (distance, time, pace, PRs on Profile) | **Phase A**: activity page with km splits, best 1 km/5 km, elevation when the phone reports it, photos |
| Privacy zones | Story card hides start/end 200 m (default on) | Account-wide privacy zone around home, applied to every card and map |
| Following, feed, kudos, comments | No | **Phase B**: follow, feed of followed athletes' moves (summaries only), kudos, comments; Firestore rules first |
| Segments, leaderboards, Local Legends | Territory Owner + Top Explorers (area-based) | **Phase C**: street segments with best times, built on the same validated GPS |
| Clubs, group challenges | No | **Phase D**: clubs and personal/group challenges with clear dates and scoring |
| Training log, weekly recap | Last 5 weeks grid | Phase A/B: weekly recap from real data |
| Integrations (Garmin, Apple Health, Health Connect) | No | Needs the native app; Health Connect (Android) first |
| Beacon (live location sharing) | No | Only with explicit opt-in, per move, to chosen contacts |

## Maps that look like Google Maps
Real Google Maps tiles need a Google Maps Platform key with billing (Map Tiles API or Maps JavaScript API) and Google's
attribution. MOVE already reads the tile source from one place (`app/lib/mapTiles.ts`), so with a browser key restricted to
MOVE's domains it is a small change. Until then: OpenStreetMap streets and Esri satellite, both shown with their attribution.

"Route that follows the real road" (snapping GPS to streets) needs a map-matching service; the free OSRM demo server is not
allowed for production use. Options: a self-hosted OSRM, or Mapbox/Google map matching (paid). MOVE currently draws exactly the
recorded GPS (cleaned of jumps), which is honest but can look wobbly where GPS is poor.
