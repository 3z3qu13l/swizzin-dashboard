# Changelog

## Unreleased

- The phone menu works like a dialog: the focus goes in and stays there, Escape closes it, and the focus comes back to the ☰ button. Closed, it leaves the keyboard order. A wider window or another page closes it.
- Closing a window or the download activity panel gives the focus back to the button that opened it.
- "Started 5 seconds ago" and the other server times stay right when the server and browser clocks differ: every API answer carries the server time (`x-server-time`).
- After a restart from the Power menu, the window says when the server is back up, from its boot time, and refreshes the data, or the whole page when swizdash changed version. After 5 minutes without it, it says so.

## 0.1.1

- Unit tests for the parsers, the catalog and the caches, run by CI and before each release.
- `scripts/smoke.sh` checks an installed swizdash from the server: services, permissions, every protection and the API.
- Content-Security-Policy on every page: only swizdash's own scripts and fonts load.
- Sonarr, Radarr, Lidarr and Prowlarr versions show again when their URL base has no leading slash.

## 0.1.0

First release: app dashboard with download activity, package management through `box`, Software menu and system dashboard.
