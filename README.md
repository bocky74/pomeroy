# 🍅 Pomeroy

A cross-platform (Windows 11, Linux, macOS) Pomodoro-style focus timer that runs
quietly in the background and logs every completed session against a **project** and
**tasks** into local **monthly JSON files**.

Built with **Tauri v2** (Rust core) and a lightweight **Vanilla TypeScript + Vite**
frontend.

## Features

- ⏱️ Configurable session length (default **25 minutes**).
- 🗂️ Set up your own **projects** and a **task list** per project (in-app Settings).
- 🫥 **Runs in the background** while a session is active — close the window and it keeps
  ticking in the system tray (tray shows the countdown).
- ⬆️ When the timer ends, the window **jumps to the front** and asks which **project** and
  which **tasks** (multiple allowed) the session counted toward, plus an optional **remark**.
- 💾 Sessions are appended to a **monthly JSON file** — existing data is never overwritten.

## Data format

On the first save, Pomeroy asks you to pick a storage folder (defaulting to your home
directory). Files are named:

```
YYYYMM_pomeroy.json      e.g. 202606_pomeroy.json
```

Each file holds a JSON array of session objects:

```json
[
  {
    "start": "2026-06-20T11:48:00+02:00",
    "end": "2026-06-20T12:13:00+02:00",
    "durationMinutes": 25,
    "project": "Pomeroy",
    "tasks": ["Design", "Docs"],
    "remark": "optional"
  }
]
```

- A session is filed by the **month of its end time**.
- If the month's file doesn't exist it is created; otherwise the new session is **appended**.
- If an existing file is somehow corrupt, it is backed up to `*.json.bak` rather than lost.

App configuration (projects, default duration, chosen folder) lives separately in the OS
app-config directory (e.g. `~/.config/com.pomeroy.app/config.json` on Linux).

## Development

### Prerequisites

- **Node.js** (LTS) and **npm**
- **Rust** (stable) via [rustup](https://rustup.rs)
- Platform WebView/build dependencies:

  **openSUSE (Tumbleweed/Leap)**
  ```bash
  sudo zypper install -t pattern devel_basis
  sudo zypper install webkit2gtk3-devel libopenssl-devel curl wget file \
    libayatana-appindicator3-devel librsvg-devel gtk3-devel libsoup-devel
  ```

  **Debian/Ubuntu**
  ```bash
  sudo apt update
  sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

  **Windows** — Microsoft C++ Build Tools + WebView2 (preinstalled on Win 11).
  **macOS** — Xcode Command Line Tools (`xcode-select --install`).

### Run / build

```bash
npm install
npm run tauri dev      # run with hot-reload
npm run tauri build    # produce a native bundle for the current OS
```

> **openSUSE note:** the `.deb` and `.rpm` bundles build fine, but the **AppImage**
> step can fail because openSUSE's `libayatana-appindicator3` pkg-config emits an extra
> `zlib-ng-compat` library path that Tauri's AppImage bundler mis-parses. Either build
> just the working bundles locally:
> ```bash
> npm run tauri build -- --bundles deb,rpm
> ```
> or let CI (Ubuntu) build the AppImage, where this quirk doesn't occur.

Regenerate icons after editing the artwork:

```bash
npm run tauri icon src-tauri/icon-source.png
```

## Releases (Windows + macOS installers)

Linux can only build Linux bundles, so Windows `.msi`/`.exe` and macOS `.dmg` are produced
by GitHub Actions. Push a tag to trigger a draft release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow in `.github/workflows/release.yml` builds for Ubuntu, Windows, and macOS
(Apple Silicon + Intel) and attaches the installers to a draft GitHub Release.

## Project layout

```
src/                 # Vanilla TS frontend
  main.ts            # app shell, routing, global event listeners
  timer.ts           # idle/running timer views + live countdown
  endDialog.ts       # end-of-session project/tasks/remark modal
  settings.ts        # projects/tasks/duration editor
  storage.ts         # typed wrappers around Tauri commands
  styles.css         # red/tomato theme (light + dark)
src-tauri/           # Rust core
  src/lib.rs         # builder, system tray, window handling
  src/timer.rs       # authoritative countdown, tray updates, raise/notify
  src/storage.rs     # config + monthly file read/append/atomic-write (+ tests)
  src/models.rs      # Session / Project / Config types
```

## License

MIT
