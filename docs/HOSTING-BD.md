# Why MOVE may not open on Bangladeshi mobile data, and the fix

## Diagnosis (November 2026)
* Symptom: on a phone that has never opened MOVE, on mobile data, the site does not load; with a VPN it does. Wi-Fi is usually fine.
* Vercel users in Bangladesh reported on 3-5 November 2026 that several Vercel edge IP addresses (in 216.198.79.x and 64.29.17.x) time
  out at the TCP connection step from Robi and Airtel mobile data, while other Vercel IPs answer normally; it comes and goes and
  needs no code change (Vercel Community: "Intermittent TCP/443 Timeouts to Specific Vercel Edge IPs from Bangladesh").
  That matches MOVE's symptom: `movefitapp.vercel.app` is served from the same edge network.
* Not verified from Bangladesh by us: this session runs outside Bangladesh and cannot test operator networks. A phone that
  opened the app before still works, because the service worker shows its saved copy (now after 6 s instead of waiting).

## The fix: serve the same app from Firebase Hosting as well
Firebase Hosting runs on Google's network, which every Bangladeshi operator reaches directly (Firestore and Google sign-in
already work there). The project already has a Hosting site: **https://move-app-f730d.web.app** (empty until the first deploy).

What is in the repository:
* `firebase.json`, `.firebaserc`: host the static build (`npm run build:static` -> `out/`), with the right cache headers.
* `.github/workflows/firebase-hosting.yml`: on every push to `master` it deploys the live site; on a `claude/*` branch it deploys
  a preview channel (URL in the job log) so you can test on mobile data first. Skipped until the key below exists.

### One-time setup (owner, about 5 minutes, browser only)
1. Firebase console -> project **move-app-f730d** -> gear icon -> **Project settings** -> **Service accounts** ->
   **Generate new private key**. A `.json` file downloads. Keep it private; never post it in a chat.
2. GitHub -> repository **Kayes2323/move-app** -> **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.
   Name: `FIREBASE_SERVICE_ACCOUNT_MOVE_APP_F730D`. Value: the whole content of that `.json` file. Save.
3. GitHub -> **Actions** -> **Firebase Hosting** -> **Run workflow** (or just push). When it finishes, open the URL it prints.
4. If the deploy fails with a permission error: Google Cloud console -> IAM -> the `firebase-adminsdk-...` service account ->
   add the role **Firebase Hosting Admin**, then run it again.

Google sign-in works on `move-app-f730d.web.app` without changes (Firebase authorises its own Hosting domains).

### Recommended next
* A custom domain (for example `moveapp.com.bd` or `getmove.app`) pointed at Firebase Hosting gives users one stable address that
  does not depend on either provider's shared hostnames, and lets us move hosting later without changing the link.
* Ask testers on Grameenphone, Robi, Banglalink and Teletalk mobile data to open both links once and report which opens.
