# bangumi-renamer

CLI tool for batch renaming anime/TV/movie files using TMDB metadata. Compatible with Infuse, Plex, Emby, Jellyfin, Kodi.

## Install

```bash
npm install -g bangumi-renamer
```

## Build & Test

```bash
npm run build    # TypeScript → dist/
npm test         # vitest
npm run check    # build + test
```

## Prerequisites

Set `TMDB_API_KEY` environment variable before running. Get a free key at https://www.themoviedb.org/settings/api

## Agent Usage

Always use `--yes` and `--json` flags for non-interactive automation.

### Rename TV/Anime

```bash
bangumi-renamer rename <dir> --tmdb-id <id> -s <season> -y --json
```

### Rename Movie

```bash
bangumi-renamer rename <path> --tmdb-id <id> -m -y --json
```

### Dry-run (preview without changes)

```bash
bangumi-renamer rename <dir> --tmdb-id <id> -s <season> -n --json
```

### Undo last rename

```bash
bangumi-renamer undo <dir> -y --json
```

### Search by name (instead of TMDB ID)

```bash
bangumi-renamer rename <dir> -q "show name" -s <season> -y --json
```

## JSON Output Schema

**Success:**
```json
{ "command": "rename", "success": true, "mediaType": "tv", "tmdbId": 209867, "showName": "...", "filesRenamed": 12, "entries": [{ "old": "...", "new": "..." }] }
```

**Dry-run:**
```json
{ "command": "rename", "dryRun": true, "mediaType": "tv", "tmdbId": 209867, "showName": "...", "entries": [{ "old": "...", "new": "..." }] }
```

**Error:**
```json
{ "command": "rename", "success": false, "error": "No video files found" }
```

## Options Reference

| Flag | Description |
|---|---|
| `-q, --query <query>` | Search TMDB by title |
| `--tmdb-id <id>` | Use TMDB ID directly |
| `-s, --season <n>` | Season number |
| `-n, --dry-run` | Preview only |
| `--offset <n>` | Episode offset (default: 0) |
| `-m, --movie` | Treat as movie |
| `-y, --yes` | Skip confirmations |
| `--json` | JSON output (implies --yes) |
| `-l, --lang <lang>` | Language (e.g. en-US, zh-CN) |

## Exit Codes

- 0: success
- 1: user cancelled
- 2: error
