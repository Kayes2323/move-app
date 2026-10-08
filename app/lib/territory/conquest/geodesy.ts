/** Distances on the WGS84 ellipsoid (Vincenty's inverse formula, millimetre accuracy), not on a sphere. */
const A = 6378137;
const F = 1 / 298.257223563;
const B = (1 - F) * A;
const rad = (d: number) => (d * Math.PI) / 180;

export interface LngLat {
  lng: number;
  lat: number;
}

export function geodesicM(p: LngLat, q: LngLat): number {
  if (p.lat === q.lat && p.lng === q.lng) return 0;
  const L = rad(q.lng - p.lng);
  const U1 = Math.atan((1 - F) * Math.tan(rad(p.lat)));
  const U2 = Math.atan((1 - F) * Math.tan(rad(q.lat)));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);
  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let cosSqAlpha = 0;
  let cos2SigmaM = 0;
  for (let i = 0; i < 200; i++) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.hypot(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
    if (sinSigma === 0) return 0;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (F / 16) * cosSqAlpha * (4 + F * (4 - 3 * cosSqAlpha));
    const next = L + (1 - C) * F * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    const done = Math.abs(next - lambda) < 1e-12;
    lambda = next;
    if (done) {
      const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
      const bigA = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
      const bigB = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
      const deltaSigma = bigB * sinSigma * (cos2SigmaM + (bigB / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - (bigB / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
      return B * bigA * (sigma - deltaSigma);
    }
  }
  // Nearly antipodal points never occur inside one city; the sphere is a safe answer there.
  const h = Math.sin(rad(q.lat - p.lat) / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(rad(q.lng - p.lng) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

/** Length of a polyline in metres. A closed ring (first point repeated at the end) gives its perimeter. */
export function pathLengthM(points: readonly LngLat[]): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) total += geodesicM(points[i], points[i + 1]);
  return total;
}
