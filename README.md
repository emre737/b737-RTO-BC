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
