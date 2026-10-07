import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { ACTIVITY_META, type ActivityKind } from "../activity";
import type { LocationSourceKind, RawFix } from "./types";

export interface LocationError {
  /** denied: the user (or OS) refused permission. unavailable: location services off / no signal. */
  code: "denied" | "unavailable" | "timeout" | "unknown";
  message: string;
}

export interface LocationHandlers {
  onFix(fix: RawFix): void;
  onError(error: LocationError): void;
  /** Web only: the page was hidden (screen locked, another app) from `from` to `to`, so no fixes were delivered. */
  onSuspended?(from: number, to: number): void;
}

export interface LocationSource {
  readonly kind: LocationSourceKind;
  start(activity: ActivityKind, handlers: LocationHandlers): Promise<void>;
  stop(): Promise<void>;
}

/** True inside the native Capacitor shell, where a real background location service is available. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
}

export type LocationAccess = "granted" | "prompt" | "denied" | "unknown";

/** Browser permission state without triggering a prompt. Native apps ask through the plugin when tracking starts. */
export async function checkLocationAccess(): Promise<LocationAccess> {
  if (isNativeApp()) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unknown"; // some browsers (older Safari) don't expose it
  }
}

/** Away from the screen for less than this isn't worth asking the user about. */
const SUSPENDED_MIN_MS = 30_000;

/** Foreground-only: browsers stop delivering GPS when the page is hidden. This is a platform limit, not something code can fix. */
export class WebLocationSource implements LocationSource {
  readonly kind = "web" as const;
  private watchId: number | null = null;
  private handlers: LocationHandlers | null = null;
  private hiddenAt: number | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private onVisibility = () => {
    if (document.visibilityState === "hidden") {
      this.hiddenAt = Date.now();
      return;
    }
    const from = this.hiddenAt;
    this.hiddenAt = null;
    if (from !== null && Date.now() - from > SUSPENDED_MIN_MS) this.handlers?.onSuspended?.(from, Date.now());
    // The browser may have dropped the watch while hidden: re-attach, and take the wake lock back.
    this.attach();
    void this.lockScreen();
  };

  async start(_activity: ActivityKind, handlers: LocationHandlers): Promise<void> {
    if (!navigator.geolocation) {
      handlers.onError({ code: "unavailable", message: "This device doesn't support location." });
      return;
    }
    this.handlers = handlers;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.attach();
    await this.lockScreen();
  }

  private attach() {
    if (!this.handlers) return;
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    const h = this.handlers;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) =>
        h.onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, time: pos.timestamp, altitude: pos.coords.altitude }),
      (err) => {
        h.onError(
          err.code === err.PERMISSION_DENIED
            ? { code: "denied", message: "Location permission was denied." }
            : err.code === err.POSITION_UNAVAILABLE
              ? { code: "unavailable", message: "Location is unavailable. Check that location services are on." }
              : { code: "timeout", message: "Waiting for a GPS signal…" }
        );
      },
      // High accuracy is what walking and running need; maximumAge allows a very recent fix to be reused.
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
  }

  private async lockScreen() {
    try {
      if ("wakeLock" in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => (this.wakeLock = null));
      }
    } catch {
      // Not supported or refused: tracking still works while the screen stays on.
    }
  }

  async stop(): Promise<void> {
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.handlers = null;
    this.hiddenAt = null;
    await this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }
}

/** Metres between fixes: walking needs finer steps than cycling, and fewer updates saves battery. */
const DISTANCE_FILTER: Record<ActivityKind, number> = { walking: 5, running: 8, cycling: 15 };

/**
 * Real background tracking through @capacitor-community/background-geolocation: on Android a foreground service
 * (with the notification Android requires) keeps delivering fixes while the screen is off or another app is open.
 * Only usable inside the Capacitor shell; it has not been run on a device from this repository.
 */
export class NativeLocationSource implements LocationSource {
  readonly kind = "native" as const;
  private plugin: BackgroundGeolocationPlugin | null = null;
  private watcherId: string | null = null;

  private async load(): Promise<BackgroundGeolocationPlugin> {
    if (!this.plugin) {
      const { registerPlugin } = await import("@capacitor/core");
      this.plugin = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
    }
    return this.plugin;
  }

  async start(activity: ActivityKind, handlers: LocationHandlers): Promise<void> {
    const plugin = await this.load();
    const noun = ACTIVITY_META[activity].noun;
    this.watcherId = await plugin.addWatcher(
      {
        // The notification text is fixed when the watcher is created; the plugin cannot update it or add buttons.
        backgroundTitle: `Move is tracking your ${noun}`,
        backgroundMessage: "Tap to return to your activity.",
        requestPermissions: true,
        stale: false,
        distanceFilter: DISTANCE_FILTER[activity],
      },
      (location, error) => {
        if (error) {
          handlers.onError(
            error.code === "NOT_AUTHORIZED"
              ? { code: "denied", message: "Location permission is needed. Allow it in Settings." }
              : { code: "unknown", message: error.message || "Location error." }
          );
          return;
        }
        if (!location) return;
        handlers.onFix({
          lat: location.latitude,
          lng: location.longitude,
          accuracy: location.accuracy,
          time: location.time ?? Date.now(),
          altitude: location.altitude,
        });
      }
    );
  }

  async stop(): Promise<void> {
    if (this.plugin && this.watcherId !== null) await this.plugin.removeWatcher({ id: this.watcherId });
    this.watcherId = null;
  }

  async openSettings(): Promise<void> {
    await (await this.load()).openSettings();
  }
}

export function createLocationSource(): LocationSource {
  return isNativeApp() ? new NativeLocationSource() : new WebLocationSource();
}
