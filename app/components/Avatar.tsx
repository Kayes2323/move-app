"use client";
import { useState } from "react";
import { initialsOf } from "../lib/profile/model";

/**
 * A person's picture, or their initials when there is none or it fails to load (a dead link never leaves a broken image).
 * Lazy by default so pictures never hold up the screen they sit on.
 */
export function Avatar({ name, photo, size, ring, priority }: { name: string; photo?: string; size: number; ring?: string; priority?: boolean }) {
  const [bad, setBad] = useState<string>("");
  const show = photo && bad !== photo;
  const shadow = ring ? { boxShadow: ring } : {};
  return show ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="av" src={photo} alt="" width={size} height={size} loading={priority ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setBad(photo)} style={{ width: size, height: size, ...shadow }} />
  ) : (
    <div className="av" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.38, ...shadow }}>{initialsOf(name)}</div>
  );
}
