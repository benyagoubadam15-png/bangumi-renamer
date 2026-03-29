# bangumi-renamer

CLI tool for batch renaming anime/TV/movie files using TMDB metadata.

## Build & Test

```bash
npm run build    # TypeScript → dist/
npm test         # vitest
npm run check    # build + test
npm run dev      # run from source via tsx
```

## Agent Usage

Always use `--yes` and `--json` for non-interactive automation. `TMDB_API_KEY` env var must be set.

```bash
# Rename TV/Anime (provide TMDB ID and season)
bangumi-renamer rename <dir> --tmdb-id <id> -s <season> -y --json

# Rename Movie
bangumi-renamer rename <path> --tmdb-id <id> -m -y --json

# Dry-run preview (no changes)
bangumi-renamer rename <dir> --tmdb-id <id> -s <season> -n --json

# Undo last rename
bangumi-renamer undo <dir> -y --json
```

### JSON output schema

Success: `{ command, success: true, mediaType, tmdbId, showName, filesRenamed, entries: [{ old, new }] }`
Dry-run: `{ command, dryRun: true, mediaType, tmdbId, showName, entries: [{ old, new }] }`
Error:   `{ command, success: false, error: string }`

### Exit codes

- 0: success
- 1: user cancelled
- 2: error
