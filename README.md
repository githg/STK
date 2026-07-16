# Stock Counter PWA

This is an offline-first Progressive Web App (PWA) designed for manual stock counting. It features a lightweight architecture with a Google Apps Script backend.

## Features

- **Offline-First**: Uses IndexedDB (via localforage) and a Service Worker to function fully without internet.
- **Batched Syncing**: Sends items to Google Sheets in batches of 10. If network fails, it retains items and retries on next sync.
- **Aggregation**: If you enter the same Item Number and Name, the app locally aggregates the quantity instead of creating duplicates.
- **PWA Installable**: Can be installed on iOS and Android homescreens without a browser URL bar.
- **Local Export**: Generates a standard CSV file (compatible with Excel) directly on the device, requiring 0 heavy external dependencies.

## Deployment Instructions

### 1. Backend (Google Apps Script) Setup

1. Open your Google Drive and create a new Google Sheet named `stk`.
2. In the Google Sheet, go to **Extensions > Apps Script**.
3. Delete any default code in the editor and copy-paste the entire contents of `Code.gs` into it.
4. Save the file.
5. Click **Deploy > New deployment**.
6. Select **Web app** as the type.
7. Under **Execute as**, select **Me (your email)**.
8. Under **Who has access**, select **Anyone**.
9. Click **Deploy**. (You will need to authorize the script permissions).
10. Once deployed, copy the **Web app URL**.

### 2. Frontend Configuration

1. Open `app.js` in your code editor.
2. Locate line 3:
   ```javascript
   const GAS_URL = "YOUR_WEB_APP_URL_HERE";
   ```
3. Replace `"YOUR_WEB_APP_URL_HERE"` with the **Web app URL** you copied in step 10.
4. Save `app.js`.

### 3. Icons (Important for true PWA installation)

For the app to be fully installable as a standalone app on iOS and Android without throwing warnings in Lighthouse, you must provide two icons in the root directory:
- `icon-192.png` (192x192 pixels)
- `icon-512.png` (512x512 pixels)

You can use any PNG images, just rename them and place them next to `index.html`.

### 4. Hosting

Host the frontend files (`index.html`, `app.js`, `style.css`, `sw.js`, `manifest.json`, and the icons) on GitHub Pages or any static file host.

**Note on initial load**: Ensure the devices have an internet connection the *first* time they load the app to cache the external CSS and JS libraries. After that, they can function completely offline.
