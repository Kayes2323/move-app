"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { LoadError } from "../../components/LoadError";
import { Loading } from "../../components/Loading";
import { showToast } from "../../lib/appToast";
import { checkPick, prepareAvatar } from "../../lib/profile/avatar";
import { removeAvatarFile, uploadAvatar } from "../../lib/profile/avatarStorage";
import { BIO_MAX, bmi, bmiBand, checkBio, checkHeight, checkName, checkUsername, checkWeight, effectivePhoto, NAME_MAX, normalizeUsername, type Privacy, type Profile } from "../../lib/profile/model";
import { loadProfile, ProfileInvalidError, saveProfile, setCustomPhoto, UsernameTakenError, usernameAvailable } from "../../lib/profile/store";

const Toggle = ({ label, hint, on, onChange, id }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void; id: string }) => (
  <label htmlFor={id} className="row" style={{ alignItems: "flex-start", gap: 14, cursor: "pointer" }}>
    <span style={{ flex: 1 }}>
      <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{label}</span>
      <span className="mute" style={{ display: "block", fontSize: 12.5, marginTop: 2, lineHeight: 1.4 }}>{hint}</span>
    </span>
    <input id={id} type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 46, height: 28, accentColor: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
  </label>
);

const field = (bad: boolean): React.CSSProperties => ({ width: "100%", marginTop: 8, minHeight: 48, padding: "10px 14px", borderRadius: 14, border: `1.5px solid ${bad ? "var(--danger)" : "var(--cardbd)"}`, background: "var(--surf)", color: "var(--ink)", fontSize: 16, fontFamily: "inherit", outline: "none" });

export default function EditProfile() {
  const [uid, setUid] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "photo">("");
  const [photoError, setPhotoError] = useState("");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("../../firebase"), import("firebase/auth")]);
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (cancelled) return;
          if (!user) { window.location.href = "/login"; return; }
          try {
            const { profile: p } = await loadProfile(user.uid);
            if (cancelled) return;
            setUid(user.uid);
            setProfile(p);
            setName(p.name);
            setUsername(p.username);
            setBio(p.bio);
            setHeight(p.heightCm ? String(p.heightCm) : "");
            setWeight(p.weightKg ? String(p.weightKg) : "");
            setPrivacy(p.privacy);
            setFailed(false);
          } catch (err) {
            console.error(err);
            if (!cancelled) setFailed(true);
          }
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [attempt]);

  const validate = useCallback((): Record<string, string> => {
    const e: Record<string, string> = {};
    const n = checkName(name); if (!n.ok) e.name = n.error;
    if (username.trim()) { const u = checkUsername(username); if (!u.ok) e.username = u.error; }
    const b = checkBio(bio); if (!b.ok) e.bio = b.error;
    const h = checkHeight(height); if (!h.ok) e.height = h.error;
    const w = checkWeight(weight); if (!w.ok) e.weight = w.error;
    return e;
  }, [name, username, bio, height, weight]);

  if (failed) return <LoadError message="Couldn't load your profile." onRetry={() => { setFailed(false); setProfile(null); setAttempt((n) => n + 1); }} />;
  if (!profile || !privacy) return <Loading label="Loading profile..." />;

  const h = checkHeight(height);
  const w = checkWeight(weight);
  const bmiValue = h.ok && w.ok ? bmi(h.value, w.value) : null;
  const shown = effectivePhoto(profile);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError("");
    const ok = checkPick(file);
    if (!ok.ok) { setPhotoError(ok.error); return; }
    setBusy("photo");
    try {
      const blob = await prepareAvatar(file);
      const url = await uploadAvatar(uid, blob);
      setProfile(await setCustomPhoto(uid, url, profile));
      showToast("Photo updated");
    } catch (err) {
      // the old picture stays exactly as it was
      setPhotoError(err instanceof Error ? err.message : "Couldn't update your photo.");
    } finally {
      setBusy("");
    }
  };

  const onUseGoogle = async () => {
    setPhotoError("");
    setBusy("photo");
    try {
      setProfile(await setCustomPhoto(uid, "", profile));
      void removeAvatarFile(uid);
      showToast("Using your Google photo");
    } catch {
      setPhotoError("Couldn't change your photo. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  };

  const onSave = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy("save");
    try {
      const next = await saveProfile(uid, { name, username, bio, height, weight, privacy }, profile);
      setProfile(next);
      setUsername(next.username);
      showToast("Profile saved");
    } catch (err) {
      if (err instanceof UsernameTakenError) setErrors({ username: "That username is taken. Try another one." });
      else if (err instanceof ProfileInvalidError) setErrors({ form: err.message });
      else setErrors({ form: offline ? "You're offline. Connect and save again." : "Couldn't save your profile. Check your connection and try again." });
    } finally {
      setBusy("");
    }
  };

  const checkHandle = async () => {
    if (!username.trim()) return;
    const c = checkUsername(username);
    if (!c.ok) { setErrors((x) => ({ ...x, username: c.error })); return; }
    if (c.value === profile.username) return;
    try {
      const free = await usernameAvailable(uid, c.value);
      setErrors((x) => ({ ...x, username: free ? "" : "That username is taken. Try another one." }));
    } catch {
      // can't check right now; saving will check again
    }
  };

  return (
    <main className="app">
      <header>
        <Link href="/profile" className="icon-btn" aria-label="Back to Profile" style={{ marginBottom: 16 }}>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <h1 className="title-blk">Edit profile</h1>
        <p className="body mute" style={{ marginTop: 6 }}>This is how you appear in MOVE.</p>
      </header>

      {offline && <p role="status" className="notice warn" style={{ marginTop: 16 }}>You&apos;re offline. You can edit, but saving needs a connection.</p>}

      <section aria-label="Photo" style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 24 }}>
        <Avatar name={name || profile.name} photo={shown} size={84} priority />
        <div style={{ minWidth: 0 }}>
          <label className="btn btn-line" style={{ width: "auto", padding: "0 20px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy === "photo" ? "Uploading…" : "Upload photo"}
            <input data-testid="photo-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(e) => { void onPick(e.target.files?.[0]); e.target.value = ""; }} style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }} />
          </label>
          {profile.photoCustom && <button className="btn btn-ghost" style={{ width: "auto", padding: "0 6px", marginTop: 4 }} disabled={Boolean(busy)} onClick={onUseGoogle}>Use my Google photo</button>}
          <p className="mute" style={{ fontSize: 12, marginTop: 6 }}>{profile.photoCustom ? "Your uploaded photo is shown." : profile.photo ? "Your Google photo is shown until you upload one." : "No photo yet: your initials are shown."}</p>
        </div>
      </section>
      {photoError && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{photoError}</p>}

      <section style={{ marginTop: 28 }}>
        <p className="lab">Profile</p>
        <label className="lab" htmlFor="ep-name" style={{ display: "block", marginTop: 16 }}>Display name</label>
        <input id="ep-name" value={name} maxLength={NAME_MAX + 10} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} style={field(Boolean(errors.name))} autoComplete="name" />
        {errors.name && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 6 }}>{errors.name}</p>}

        <label className="lab" htmlFor="ep-user" style={{ display: "block", marginTop: 16 }}>Username <span className="mute" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(optional)</span></label>
        <div style={{ position: "relative" }}>
          <span aria-hidden="true" className="mute" style={{ position: "absolute", left: 14, top: 8 + 13, fontSize: 16 }}>@</span>
          <input id="ep-user" value={username} onChange={(e) => { setUsername(normalizeUsername(e.target.value)); setErrors((x) => ({ ...x, username: "" })); }} onBlur={checkHandle} aria-invalid={Boolean(errors.username)} aria-describedby="ep-user-hint" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={21} style={{ ...field(Boolean(errors.username)), paddingLeft: 32 }} />
        </div>
        <p id="ep-user-hint" className="mute" style={{ fontSize: 12, marginTop: 6 }}>3-20 letters, numbers or underscores. Unique to you.</p>
        {errors.username && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 6 }}>{errors.username}</p>}

        <label className="lab" htmlFor="ep-bio" style={{ display: "block", marginTop: 16 }}>Bio <span className="mute" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(optional)</span></label>
        <textarea id="ep-bio" value={bio} rows={3} onChange={(e) => setBio(e.target.value)} aria-invalid={Boolean(errors.bio)} style={{ ...field(Boolean(errors.bio)), resize: "none", minHeight: 84 }} />
        <p className="mute" style={{ fontSize: 12, marginTop: 6, textAlign: "right" }}>{bio.length}/{BIO_MAX}</p>
        {errors.bio && <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>{errors.bio}</p>}
      </section>

      <section style={{ marginTop: 28 }}>
        <p className="lab">Fitness details · optional</p>
        <p className="mute" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>Not needed to use MOVE. Private: only you can see these, and they are never shown to other people.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="lab" htmlFor="ep-h" style={{ display: "block", marginTop: 14 }}>Height (cm)</label>
            <input id="ep-h" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} aria-invalid={Boolean(errors.height)} placeholder="e.g. 170" style={field(Boolean(errors.height))} />
          </div>
          <div>
            <label className="lab" htmlFor="ep-w" style={{ display: "block", marginTop: 14 }}>Weight (kg)</label>
            <input id="ep-w" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} aria-invalid={Boolean(errors.weight)} placeholder="e.g. 65" style={field(Boolean(errors.weight))} />
          </div>
        </div>
        {(errors.height || errors.weight) && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{errors.height || errors.weight}</p>}
        <div className="card" data-testid="bmi" style={{ marginTop: 14 }}>
          <p className="lab">BMI</p>
          <p className="blk" style={{ fontSize: 26, marginTop: 4 }}>{bmiValue ?? "—"}</p>
          <p className="mute" style={{ fontSize: 12.5, marginTop: 2 }}>{bmiValue ? `${bmiBand(bmiValue)}. A rough guide only; it doesn't account for muscle or build.` : "Add your height and weight to see it. Only you can see this."}</p>
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <p className="lab">Privacy</p>
        <div style={{ marginTop: 4 }}>
          <Toggle id="pv-terr" label="Show me in Territory and the leaderboard" hint="Your name and photo appear to other people. Off: you appear as “Move athlete”." on={privacy.showInTerritory} onChange={(v) => setPrivacy({ ...privacy, showInTerritory: v })} />
          <Toggle id="pv-user" label="Show my username" hint="Only if you set one." on={privacy.showUsername} onChange={(v) => setPrivacy({ ...privacy, showUsername: v })} />
          <Toggle id="pv-bio" label="Show my bio" hint="Only if you wrote one." on={privacy.showBio} onChange={(v) => setPrivacy({ ...privacy, showBio: v })} />
        </div>
        <p className="mute" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.45 }}>Your height, weight, BMI, email and the routes you move on are never public. Territory boards show only ground explored and counts, never where you are.</p>
      </section>

      {errors.form && <p role="alert" className="notice bad" style={{ marginTop: 18 }}>{errors.form}</p>}
      <button className="btn btn-go" style={{ marginTop: 22 }} onClick={onSave} disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : "Save profile"}</button>
      <div style={{ height: 24 }} />
    </main>
  );
}
