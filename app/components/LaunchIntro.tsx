import { LAUNCH_INTRO_CSS, LAUNCH_INTRO_HTML, LAUNCH_INTRO_SCRIPT } from "../lib/launchIntro";

/**
 * Move's opening animation. Plain server-rendered markup and one inline script (see lib/launchIntro): it is painted before the app has
 * loaded, plays once per app start, and the page underneath keeps loading in parallel.
 */
export function LaunchIntro() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LAUNCH_INTRO_CSS }} />
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: LAUNCH_INTRO_HTML }} />
      <script dangerouslySetInnerHTML={{ __html: LAUNCH_INTRO_SCRIPT }} />
    </>
  );
}
