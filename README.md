# SwingLab (Golf Swing Analyzer)

A browser-based tool that analyzes a golf swing from one phone video. It tracks your body with
[MediaPipe Pose](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker), splits the swing into phases,
measures a handful of swing metrics, flags faults, writes coaching feedback, recommends drills, and tracks your swings over time.

Everything runs on your device. Your video is never uploaded. The only optional network call is the "written feedback from
Claude" button, which sends a small metrics summary (never video or landmark data) using your own API key.

Status: **v0.2** (phase 1 of the roadmap, redesigned as an iPhone-style Home Screen app). Built for a left-handed golfer filming on a
propped iPhone at 120 fps, but handedness, camera angle, and frame rate are all settings.

The app is called **SwingLab**: a dark, sport-performance interface with a bottom tab bar (Home, Progress, Drills, Settings), a guided
"Add a swing" sheet, and a results screen with a swing score ring, a phase scrubber, measurement gauges and the single most useful fix
at the top. The swing score is a confidence-weighted share of measurements inside their target range. It restates this app's own
thresholds and is not a validated rating.

## Run it

Requires Node 20 or newer.

```bash
npm install        # also copies the MediaPipe runtime into public/ and downloads the pose model (about 9 MB)
npm run dev        # http://localhost:5173
```

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run build` then `npm run preview`.

If the post-install download fails (offline, proxy), the app falls back to loading the runtime and model from a CDN at run time.
Phones on the same Wi-Fi can open the "Network" URL that `npm run dev` prints, though camera features beyond file upload need HTTPS.

## Using it from an iPhone

SwingLab is a web page built to behave like an app once it is on the Home Screen: full screen, its own icon and launch image, a
bottom tab bar, bottom sheets, safe-area aware, and it works offline after the first load (a service worker caches the page, the
pose runtime and the model).

- **Same Wi-Fi as your computer:** double-click `Start for iPhone (same Wi-Fi).bat` (Windows), or run `npm run dev -- --host`. Open the
  `Network:` address it prints (something like `http://192.168.1.20:5173`) in Safari on the iPhone. Allow Node.js through the
  firewall on private networks only. The computer has to stay on with that window open, and anyone on the same network can open the page.
  Over plain http the Home Screen icon works as a shortcut but offline caching is off.
- **Install it properly, anywhere, such as the range:** run `npm run build:hosted`. That makes a `dist-hosted` folder of plain files
  (the page, the pose runtime and the model, all with relative paths, about 45 MB) that any static host can serve over https: Netlify
  (drag the folder onto app.netlify.com/drop), Cloudflare Pages, GitHub Pages, AWS Amplify or S3 with CloudFront. Open the https address in
  **Safari** on the iPhone, tap Share, then **Add to Home Screen**. It then opens full screen as SwingLab. Your videos still stay on the
  phone. If a host forbids WebAssembly in its security policy, the app says so instead of failing mid-analysis.
- **Storage:** saved swings live in the browser storage for that exact address. The computer and the phone keep separate histories, and a
  new address starts empty. Safari can clear storage for sites you have not opened in about a week; a Home Screen app is exempt from that.
- Pick the clip with the Add a swing sheet; it opens your Photos library. iOS may re-encode slow-motion clips when you pick them, and the
  app warns if the frame timing looks wrong. Not yet tested on a real iPhone.
- **Icon and launch images:** `node scripts/make-assets.cjs` re-renders them into `public/` (needs Playwright with Chromium, used only by
  that script). The mark is a ball launching on a rising trail, defined once in `scripts/make-assets.cjs` and `src/ui/icons.tsx`.

## Filming a swing that analyzes well

- Prop the phone about waist height, roughly 3 m (10 ft) away, held perfectly still. Landscape, 120 fps (Slo-mo on iPhone).
- **Face-on** (camera square to the target line, looking at your chest): head sway, hip slide, finish balance.
- **Down-the-line** (camera behind you on the extension of the target line): spine angle, hips toward the ball, hand path.
- Keep your whole body, the club, and the finish in frame, with even light and a plain background.
- One swing per clip. Start recording once you are set at address; stop after you hold the finish.
- Use the original slo-mo video, not one edited or re-shared with the slow-motion ramp baked in: AirDrop it, or Share and choose
  Options, All Photos Data. Clips whose frame timing changes partway through give unreliable tempo, and the app warns about them.
- If a clip will not play in your browser, set the iPhone to Most Compatible (Settings, Camera, Formats) so it records H.264.

Metrics that need the other angle show as "Not measured". Film both angles for a full picture.

## What it measures

| Metric | View | Notes |
| --- | --- | --- |
| Tempo | either | backswing time / downswing time, in real seconds even for slow-motion exports. Target about 3 : 1 |
| Head sway | face-on | head movement away from the target in the backswing, in shoulder widths |
| Hip slide | face-on | hip shift toward the target by impact, in shoulder widths |
| Finish balance | face-on | hips relative to the lead foot in the finish |
| Spine angle change | down-the-line | forward tilt at impact versus address, degrees |
| Hips toward the ball | down-the-line | early extension, in torso lengths |
| Downswing hand path | down-the-line | hands versus the address plane line at mid-downswing (experimental) |
| Lead arm at the top | either | elbow angle (experimental 2D estimate) |

Every metric carries a confidence score from landmark visibility and sampling precision, and faults below 40% confidence are not reported.
**The thresholds are starting heuristics, not validated norms.** They live in one place, `src/analysis/metrics.ts` (`THRESHOLDS`),
and should be tuned against a coach's read of real swings.

## How it works

```
video file -> frames (seek + MediaPipe, src/pose) -> gap fill + glitch removal + One Euro smoothing (src/analysis/skeleton.ts)
           -> phases from hand path/speed (phases.ts) -> metrics (metrics.ts) -> ranked faults (faults.ts)
           -> template coach or Claude (src/coach) -> overlay player + history (src/ui, src/storage)
```

- **Frame rate handling** (`src/pose/extract.ts`): the app plays a few frames at three places in the clip, slowed down so a 60 Hz
  display cannot hide frames, and reads their exact timestamps to get the native frame spacing. It compares that with the recorded
  frame rate setting to detect slow-motion exports (a 30 fps file of a 120 fps recording is slowed back to real time), and samples at
  up to 60 fps of real time (or every frame in "Maximum" mode). If the spacing differs between parts of the clip (variable-speed
  slow motion) it says so, because tempo cannot be trusted then. "Not sure" in settings treats the clip as real time.
- **Phases** (`src/analysis/phases.ts`): the address baseline is the last still stretch before the backswing, so a walk-in or waggle is
  skipped. Top = the middle of the flat peak of the hand path before the speed peak. Takeaway = when the hands leave address,
  extrapolated back from two displacement crossings (motion starts from rest, so a plain threshold always reads late). Impact = hands
  closest to their address position around the hand-speed peak. Finish = first sustained slow-down after the follow-through.
  If hand speed does not lead to a believable swing (filmed from behind the golfer the hands move toward the camera at impact, so
  their on-screen speed is small and tracking glitches can outrun the real downswing), the swing is located again from the height
  of the hands: they rise slowly to the top, fall fast to impact and rise into the finish (`swingFromHeight`). Wrist tracks also get
  a wider outlier filter than other landmarks, because the wrists are the ones lost for several frames at the top.
  Timing resolution is one analyzed frame (about 17 ms at 60 fps), which moves a 3 : 1 tempo by roughly 0.1 to 0.2.
- **Smoothing** removes single-frame pose glitches (Hampel filter), then runs a One Euro filter forward and backward and averages the
  passes, which removes lag so top and impact timing stay accurate. It works in real time and in height units, so portrait and
  landscape clips and slow-motion timelines behave the same.
- **Sanity checks** warn about a second swing in the clip, a golfer still moving at the start, a handedness setting that contradicts the
  clip, an unusual backswing or downswing duration, and clips filmed at low frame rates.
- **Storage:** swings (landmarks, phases, metrics, coach note, thumbnail) are saved in IndexedDB. The clip itself is kept only if you tick "Keep clip".

## Project layout

```
src/analysis/   phases, metrics, faults, score, geometry, skeleton (pure TypeScript, unit-tested)
src/pose/       MediaPipe wrapper, frame extraction, One Euro filter
src/coach/      drill library, template coach, optional Claude coach
src/storage/    IndexedDB swing history
src/demo/       synthetic swing generator (used by tests and the "See a demo" and "Try a demo swing" buttons)
src/ui/         React components: tab bar, sheets, home, results (score ring, overlay player, metric gauges), coach, progress, settings
src/styles.css  the SwingLab design system (dark theme tokens, components, safe-area handling)
public/         manifest, service worker (sw.js), app icon, favicon and iPhone launch images
scripts/        mediapipe setup, make-assets.cjs (icon and launch image generator)
```

## Tuning on your own swings

Use **Export data (JSON)** in the "more" menu on a results screen to download the tracked landmarks, phases, metrics, and faults as JSON. Comparing those
with how a coach reads the same swing is how the thresholds get calibrated (roadmap phase 2).

## Known limits

- A single 2D camera cannot measure true 3D rotation, so every metric is tied to the camera angle it was filmed from.
- Pose tracking gets noisy when the club, loose clothing, or poor light hides joints. Check the annotated replay before trusting a number.
- Not tested yet on real swing footage: unit tests use a simulated stick-figure swing (with noise, waggles, walk-ins, and glitch frames),
  and the pose pipeline and frame-rate detection were exercised on stand-in videos at 30, 60, and 120 fps. Expect to adjust thresholds
  and some phase timing once you run your own swings through it.
- The hand-path "plane line" check and the lead-arm angle are rough 2D estimates; treat them as hints, not measurements.
- A mirrored swing cannot be told apart from the pose alone, so the handedness setting matters. The app warns when the hands move
  toward the lead side in the backswing, which usually means the setting is the wrong way round.
- Swing-mechanics suggestions only. This is not medical advice; keep drills within your comfort.

## Roadmap

1. **MVP (this version):** upload, pose tracking, phases, metrics, overlay, template coach, local history.
2. **Calibrate:** capture framing guide, coach-labeled swings, tuned thresholds.
3. **Coach v2:** backend proxy for the Claude API, drill videos, reference-swing overlay.
4. **Product:** accounts and sync, mobile wrapper, two-angle analysis, club tracking, launch monitor import.

## Live site

https://jakesilverthorn-a11y.github.io/swinglab/

The prebuilt site lives in `site/` (made with `npm run build:hosted`, output in `dist-hosted/`). To update it, rebuild, replace the
contents of `site/` with `dist-hosted/`, and push to `main`. The "Publish site" workflow copies `site/` to the `gh-pages` branch, which
GitHub Pages serves.
