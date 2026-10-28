/**
 * Journey milestones. Two different kinds, kept apart on purpose:
 *
 *  - DISTANCE milestones: "5 km of your journey done". Driven only by the distance Move recorded on the journey. Say nothing about
 *    where the user is.
 *  - ARRIVAL milestones: "you've reached Jatrabari". Driven only by the phone's GPS being at a place, and only configured here for
 *    places whose coordinates were CHECKED against a source (name it in `source`). A checkpoint that is on the route but not listed
 *    here has no arrival milestone: its coordinates in routes.ts are approximate or unchecked, and an arrival message must never be
 *    shown for a place the user may not be at. To add one: verify the coordinates, then add an entry. Nothing else changes.
 *
 * Checked so far (2026-10, Wikipedia infobox coordinates; those are given to one arc-minute, so the radius is generous):
 *  - Jatrabari Thana 23.7105 N 90.4355 E (routes.ts has 90.4429: 0.7 km east, kept as the route's drawing point)
 *  - Hajiganj Upazila 23.250 N 90.850 E (matches routes.ts)
 * Looked at and NOT used: Kachua. Wikipedia gives 23.350 N 90.883 E, routes.ts has 23.3333 N 90.7667 E, about 12 km apart, so
 * routes.ts's Kachua point is not trustworthy for arrival. Kanchpur, Mograpara, Gouripur and Chandpur were not checked.
 */
export interface ArrivalMilestone {
  /** Must equal a checkpoint name on the route. */
  checkpoint: string;
  lat: number;
  lng: number;
  /** Arrival = this close. */
  radiusM: number;
  title: string;
  message: string;
  source: string;
}

/** Every this many km of recorded journey distance. */
export const DISTANCE_MILESTONE_KM = 5;

export const ARRIVAL_MILESTONES: Record<string, ArrivalMilestone[]> = {
  chandpur: [
    { checkpoint: "Jatrabari", lat: 23.7105, lng: 90.4355, radiusM: 1500, title: "Gateway to Dhaka", message: "You've reached Jatrabari, the gateway to Dhaka!", source: "Wikipedia: Jatrabari Thana (23.7105 N, 90.4355 E)" },
    { checkpoint: "Hajiganj", lat: 23.25, lng: 90.85, radiusM: 2500, title: "Hajiganj", message: "You've reached Hajiganj, the gateway to Chandpur!", source: "Wikipedia: Hajiganj Upazila (23.250 N, 90.850 E)" },
  ],
};
