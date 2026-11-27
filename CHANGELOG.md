# Changelog

## 0.1.6

- Komga (Readers) in the catalog. Airsonic, archived upstream, is no longer installed by swizzin: it stays listed for servers that have it, to stop or remove it.

## 0.1.5

- Kavita (Readers) and FileBrowser Quantum (File Management) in the catalog: swizdash installs, removes and updates them, and checks their latest release on GitHub. They need swizzin with their box scripts.

## 0.1.4

- Installed apps say when a newer version exists, and how to update them: an Updates tab next to Application control and Package management (apps to update, all checked apps, those that could not be checked, with the command to copy), a badge next to the version in Apps, and an Apps section in System updates. On phones the tabs read Control, Packages and Updates. Apps installed with apt are checked against apt's candidate, without the network. Apps downloaded from GitHub are checked against their latest release, every 6 hours at most, and again after 15 minutes when GitHub could not be reached. The command is `box upgrade <app>` when swizzin has one, `apt-get install --only-upgrade <package>` for apt.
- Latest releases, for the apps and swizdash itself, are read where `github.com/<repo>/releases/latest` redirects to, as swizzin does, instead of the GitHub API: the API allows 60 calls an hour per address without an account, often shared on seedbox hosts.
- The installed version of SABnzbd, qui and autobrr shows again: SABnzbd is no git checkout, qui and autobrr are in `/usr/bin`.

## 0.1.3

- System updates also say whether swizzin and swizdash are up to date, and how to update them: swizzin against the branch `box update` follows on the remote of `/etc/swizzin`, swizdash against its latest release on GitHub. The server checks at most every 3 hours, apart from the rest of the page. Offline or over the GitHub limit, it says "could not check" and tries again 10 minutes later. An `/etc/swizzin` that `box update` leaves alone (a link, or a `.dev.lock` file) is "managed manually".
- The hardware panel shows CPU cores switched off, thermal throttling and ECC memory errors since the last boot, and the CPU microcode. Cores switched off on purpose (SMT off, `maxcpus=`) are not a warning. What the machine does not report, like most virtual machines and containers, says "Not available on this machine" rather than a green status.

## 0.1.2

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
