# swizdash

A web dashboard for [swizzin](https://swizzin.ltd) seedboxes. It runs next to the swizzin panel, on its own HTTPS port, behind the swizzin login of the master user.

- **Home**: what needs a look (failed apps, pending updates), disk space, CPU and memory, active torrents, and the running apps to open.
- **System**: an Activity tab with live usage, 30 days of history and daily traffic (vnStat); a Health tab with hardware, CPU vulnerabilities, thermal throttling and ECC memory errors, RAID and SMART, Fail2Ban bans. Copy a diagnostic for a bug report, clear the history, restart or shut down the server.
- **Apps**: every installed app with its status, version, port, services, files and API key, filtered by installed, running, stopped, with an update, or available. Start, stop, restart, open or remove each app, and install the others with `box`, following the log while it runs.
- **Updates**: whether swizzin, swizdash, the installed apps and the system packages are up to date, with the command to run. The apps are checked against apt, or against their project's latest release on GitHub every 6 hours: GitHub sees which of those apps the server has.
- **Downloads**: every torrent of rTorrent, qBittorrent, Transmission and Deluge, read only, filtered by status or client.
- **Header**: search an app to open it, live CPU, memory and network, and the theme button: five glass themes, with the panel opacity and blur to taste.
- **Open menu**: the installed apps by category, one click away.

## Install

From a swizzin server whose `/etc/swizzin` comes from [3z3qu13l/swizzin](https://github.com/3z3qu13l/swizzin):

```
box install swizdash
```

The address is printed at the end (`https://<server>:8444` unless that port is taken). `box upgrade swizdash` installs the release swizzin pins (after `box update`) and `box remove swizdash` removes it.

Tested on Debian 13 and Ubuntu 26.04. Needs Node.js 24 or newer, which `box` installs if needed.

## How it works

| Part | Where | Runs as |
|---|---|---|
| Web app (React, Tailwind, ECharts) | `/opt/swizdash/public` | served by the server below |
| Server (Node.js, no dependency) | `/opt/swizdash/server` | `swizdash`, a system user without a shell |
| Socket for nginx | `/run/swizdash/http.sock` | opened by `swizdash.socket` |
| Root helper | `/usr/local/sbin/swizdash-helper` | root, through one sudo rule |
| History (SQLite) | `/var/lib/swizdash/history.db` | `swizdash` |
| Install and removal logs | `/var/log/swizdash/jobs` | written by root, read by `swizdash` |

### Security model

The dashboard can start services and run `box` as root, so every layer limits what a request can do:

1. **nginx** asks for the swizzin master's password, the only account allowed in.
2. nginx talks to the server through a **unix socket** opened by systemd, that only the `www-data` group can use, and adds a **secret token** to each request. The token sits in a file only root and `swizdash` can read, so other local users are refused. The server itself is not in the `www-data` group.
3. Requests that change something must be JSON and come from the dashboard's own page: a form or script on another site is refused.
4. The server **never runs as root**. It can only call the helper through sudo, and the helper **checks every argument**: services must be listed in the catalog, users must be swizzin users, apps must have a `box` script, and only one install or removal runs at a time.
5. Apps whose installer or removal asks questions are not offered: without anyone to answer, `box` would take the default answer, which can delete settings. The page says to run them over SSH.
6. The code in `/opt/swizdash` and the catalog belong to root, the `swizdash` user cannot change what the helper reads.
7. Passwords and API keys never appear in command lines, where any local user could read them: the helper hands them to `curl` and `jq` through standard input or the environment.
8. Files and sockets in a user's home are read as that user, never as root.
9. `box` checks the SHA-256 of the downloaded archive before installing it: swizzin pins the version and its checksum.
10. nginx workers keep the token in memory and run as `www-data`, like PHP (ruTorrent). With `kernel.yama.ptrace_scope = 0`, the Debian default, any `www-data` process could read that memory: `box install` and `box upgrade swizdash` set it to 1, and `box remove swizdash` puts 0 back only where swizdash changed it. Ubuntu already uses 1.

### The catalog

`catalog/apps.json` describes the apps `box` can install: category, systemd units (a trailing `@` is a per-user unit), web path, files, where the API key is, how to read the version, and whether the installer asks questions. An app missing from the catalog is not shown. Each field is described on `CatalogApp` in `server/src/apps.ts`.

### Code layout

| Path | What |
|---|---|
| `server/src/main.ts` | HTTP routes and static files |
| `server/src/apps.ts` | the catalog, systemd states, installed versions |
| `server/src/system.ts`, `history.ts` | live usage from /proc, and its SQLite history |
| `server/src/extra.ts` | traffic, updates (apt, swizzin, GitHub), RAID, CPU health, install and removal jobs |
| `server/src/parse.ts` | pure parsers, covered by `server/test` |
| `server/src/helper.ts`, `helper/swizdash-helper` | the sudo bridge, and the root helper whose commands are listed at its end |
| `server/src/config.ts` | paths, and the `SWIZDASH_*` variables that override them |
| `web/src/pages`, `components`, `lib` | the pages, shared components, API client and queries (`lib/queries.ts`) |
| `web/public/theme.js` | applies the saved theme before the first paint |

nginx, systemd, sudo and the pinned release are set up by swizzin: `sources/functions/swizdash` and `scripts/{install,remove,upgrade}/swizdash.sh` in [3z3qu13l/swizzin](https://github.com/3z3qu13l/swizzin).

## Development

```
npm ci --prefix web
npm run check      # types, lint, formatting
npm test           # server unit tests
npm run build      # web app in dist/public
npm run package    # dist/swizdash.tar.gz
```

For the web app, start a server on a test machine with `SWIZDASH_PORT=8799 SWIZDASH_TOKEN_FILE=<file> node server/src/main.ts`, open a tunnel with `ssh -L 8799:127.0.0.1:8799 root@<server>`, then run `SWIZDASH_DEV_TOKEN=<token> npm --prefix web run dev`.

To try a local build: `SWIZDASH_ARCHIVE=/root/swizdash.tar.gz box install swizdash` (or `box upgrade swizdash`). Then copy `scripts/smoke.sh` to that server and run it as root: it checks the services, permissions, protections and API.

## Release

1. Set the version in `package.json`, `web/package.json` and `web/package-lock.json` (twice), and give the `CHANGELOG.md` section that number.
2. Push a matching tag (`v0.1.2`). The Release workflow checks, tests, builds and publishes `swizdash.tar.gz` and its `.sha256`.
3. In [3z3qu13l/swizzin](https://github.com/3z3qu13l/swizzin), set `swizdash_version` and `swizdash_sha256` in `sources/functions/swizdash`: `box install` and `box upgrade` only install that release.

## License

GPL-3.0-or-later, like swizzin.
