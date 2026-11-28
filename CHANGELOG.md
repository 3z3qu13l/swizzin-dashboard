# Changelog

## Unreleased

- The Home, Apps and Updates pages no longer load the charts library (184 kB gzipped).
- The Server card shows swizzin's version even when /etc is kept in git (etckeeper).
- The catalog format is documented on `CatalogApp` (`server/src/apps.ts`), and the README describes the code layout.

## 0.1.9

- Five themes instead of three, with translucent panels over a colored backdrop: Aurore (the default, from Night), Givre (light, from Day), Crépuscule, Abysse, and Ardoise (nearly opaque, from Dusk). A theme chosen before is replaced by the closest one. The theme menu also sets the panel opacity and the blur of the header and menu, for each browser. With the system setting "reduce transparency" (Chrome and Edge), panels are opaque.
- The header no longer overflows the window between 1024 and 1279 pixels wide: there, the live CPU, memory and network values show without their trend lines.
- Pages reorganized, in the menu order Home, System, Apps, Updates, Downloads, with counters for failed apps, pending updates and active torrents. The menu's app list is now called Open.
  - Home: one sentence on the server, badges for what needs a look (none when nothing does), the resources, storage and downloads cards, and the running apps to open.
  - System: two tabs, Activity (figures, history, traffic) and Health (hardware, disks, Fail2Ban, inventory).
  - Apps: one page for Application control, Package management and Updates, with five filters: Installed, Running, Stopped, Updates, Available. Installed apps can be searched. Remove is in an app's details. The banner of an install or removal in progress shows on every filter.
  - Updates: swizzin and swizdash, the system packages and the apps, in one place.
  - Downloads: a page of its own instead of the side panel. Tiles for each status and the list of clients filter the torrents, kept in the address. Each client shows its folder, size and share done. Traffic per day is below.
  - Old links to `/?mode=packages` and `/?mode=updates` open the matching Apps filter.
- Homepage leaves the catalog: swizzin no longer installs it, swizdash replaces it.

## 0.1.8

- transfer.sh (File Management) in the catalog: swizdash installs it, shows its updates, and checks its latest release on GitHub. It needs nginx, and swizzin with its box scripts. Its removal asks whether to delete the shared files: it runs with `box remove transfersh` over SSH.

## 0.1.7

- Ombi is checked against its latest GitHub release, whether swizzin installed it from GitHub (Debian 13 and later) or from apt: its installed version is read from either. The command is `box upgrade ombi`. Where Ombi comes from apt (Ubuntu), apt.ombi.app may publish a release a little after GitHub: the update shows before apt has it.

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
