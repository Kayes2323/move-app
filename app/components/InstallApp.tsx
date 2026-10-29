"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { showToast } from "../lib/appToast";

const noop = () => () => {};

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** The "Install Move" row of Settings: installs it as a real app when the browser offers that, and says how when it doesn't. */
export function InstallApp() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  // read from the browser without a state-in-effect: false on the server, the real value on the phone
  const running = useSyncExternalStore(noop, () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true, () => false);
  const ios = useSyncExternalStore(noop, () => /iphone|ipad|ipod/i.test(navigator.userAgent), () => false);
  const standalone = running || installed;

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      setInstalled(true);
      showToast("Move installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) return null; // already running as an installed app

  const install = async () => {
    if (!event) return setHelp((h) => !h);
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") setEvent(null);
  };

  return (
    <div>
      <button onClick={() => void install()} className="row" data-testid="install-app"><span>Install Move as an app</span><span className="mute" style={{ fontSize: 14 }}>{event ? "Ready" : "How"}</span></button>
      {help && (
        <p className="body mute" role="status" style={{ fontSize: 13, lineHeight: "19px", padding: "0 0 12px" }}>
          {ios
            ? "In Safari, tap the Share button, then Add to Home Screen."
            : "In Chrome, open the ⋮ menu and tap Install app. If you only see Add to Home screen, remove the old Move shortcut from your home screen first, then reload this page and try again."}
        </p>
      )}
    </div>
  );
}
