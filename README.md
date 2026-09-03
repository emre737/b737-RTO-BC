# B737 RTO Brake Energy Calculator

GitHub Pages-ready PWA for B737-800 NG and B737-8 MAX RTO brake-energy evaluation.

## GitHub Pages deployment

1. Create a new GitHub repository.
2. Upload **all files in this folder to the repository root** (do not upload only the ZIP).
3. Commit the files.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, select **Deploy from a branch**.
6. Select your main branch and **/(root)**, then Save.
7. After GitHub publishes the page, open the Pages URL in Safari on iPhone/iPad and use **Share → Add to Home Screen**.

The PWA includes an offline service worker and `.nojekyll` for GitHub Pages.

## Test

```bash
node tests.js
```

Current automated tests cover QRH grid values, interpolation, IAS wind correction, GS logic, taxi-energy addition, unavailable MAX cells, and zone thresholds.

> Advisory tool only. Verify calculations against the current company QRH and procedures before operational use.


## UI note

This build replaces the previous silhouette with a blended hero image of a front-view 737 MAX on a wet runway.


## New in v1.2.0

- Adds a speed-threshold graph below the main result card.
- Shows the estimated brakes-on speed where CAUTION starts and where MELT starts for the current conditions.


## New in v1.3.0

- Upgrades the speed-threshold chart with a premium visual style.
- Adds smoothed line rendering, glow effects, shaded caution and melt zones, marker callouts, and sparse-QRH invalid-range shading.


## New in v1.4.0

- Removes the chart for a cleaner mobile layout.
- Keeps Caution and Melt threshold speeds as premium numeric cards.
- Adds current-speed comparison/margin text for each threshold.


## v1.4.1

- Adds a tiny visible build number under the RTO Calculator title.
- Keeps the numeric-only Caution/Melt speed threshold card (no chart).
- Uses network-first service-worker behavior plus versioned asset URLs to reduce stale GitHub Pages/PWA caching after updates.
