# MediaStation

Local-first video library, player, and subtitle manager for Windows.

## Download

Get the latest installer from [Releases](https://github.com/Aculiecinieks/MediaStation/releases/latest). Run it. No separate runtime setup is required.

Windows 10 or 11, x64.

## Features

- Local video folders and individual files
- Groups and seasons with watch progress
- SRT and VTT subtitles
- Local Whisper subtitle generation
- YouTube links and captions
- JSON save files

## Updates

MediaStation checks GitHub Releases for updates. When one is available, the download button in the header lights up. Click it to download and install the new version.

## Development

Requirements: Node.js, Rust, and Visual Studio C++ Build Tools.

```powershell
npm install
npm run tauri dev
```

Type check:

```powershell
npm run check
```

Build the installer:

```powershell
npm run tauri build
```

## Releases

Push a version tag such as `v1.1.0`. GitHub Actions builds the Windows installer and publishes it with the updater manifest.
