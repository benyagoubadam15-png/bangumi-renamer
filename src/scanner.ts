import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  VIDEO_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  KNOWN_LANG_SUFFIXES,
  type MediaFile,
  type MediaFileGroup,
} from './types.js';

/**
 * Parse a subtitle filename to extract the language suffix and the "stem" (base name without lang + ext).
 *
 * Example: "Show - 01.zh-cn.ass" → { ext: ".ass", langSuffix: "zh-cn", stem: "Show - 01" }
 */
export function parseSubtitleFilename(filename: string): {
  ext: string;
  langSuffix: string | undefined;
  stem: string;
} {
  // Find the subtitle extension
  const lowerName = filename.toLowerCase();
  let ext = '';
  for (const subtitleExt of SUBTITLE_EXTENSIONS) {
    if (lowerName.endsWith(subtitleExt)) {
      ext = subtitleExt;
      break;
    }
  }
  if (!ext) {
    return { ext: path.extname(filename).toLowerCase(), langSuffix: undefined, stem: path.basename(filename, path.extname(filename)) };
  }

  // Strip the subtitle extension to check for language suffix
  const withoutExt = filename.slice(0, filename.length - ext.length);

  // Check if there's a language suffix before the extension
  const lastDot = withoutExt.lastIndexOf('.');
  if (lastDot > 0) {
    const possibleLang = withoutExt.slice(lastDot + 1).toLowerCase();
    if (KNOWN_LANG_SUFFIXES.has(possibleLang)) {
      return {
        ext,
        langSuffix: possibleLang,
        stem: withoutExt.slice(0, lastDot),
      };
    }
  }

  return { ext, langSuffix: undefined, stem: withoutExt };
}

/**
 * Classify a single filename into a MediaFile.
 * Returns null if the file is neither a video nor a subtitle.
 */
export function classifyFile(dir: string, filename: string): MediaFile | null {
  const lowerName = filename.toLowerCase();

  // Check video
  for (const videoExt of VIDEO_EXTENSIONS) {
    if (lowerName.endsWith(videoExt)) {
      const ext = videoExt;
      const stem = filename.slice(0, filename.length - ext.length);
      return { path: path.join(dir, filename), filename, ext, kind: 'video', stem };
    }
  }

  // Check subtitle
  for (const subExt of SUBTITLE_EXTENSIONS) {
    if (lowerName.endsWith(subExt)) {
      const parsed = parseSubtitleFilename(filename);
      return {
        path: path.join(dir, filename),
        filename,
        ext: parsed.ext,
        kind: 'subtitle',
        langSuffix: parsed.langSuffix,
        stem: parsed.stem,
      };
    }
  }

  return null;
}

function hasMediaExtension(name: string): boolean {
  const lower = name.toLowerCase();
  for (const ext of VIDEO_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  for (const ext of SUBTITLE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

/**
 * Scan a directory and return classified media files.
 * Handles download tools that create directories named like media files
 * (e.g., "Episode-01.mkv/" containing "Episode-01.mkv").
 */
export async function scanDirectory(dir: string): Promise<{ videos: MediaFile[]; subtitles: MediaFile[] }> {
  const entries = await readdir(dir);
  const videos: MediaFile[] = [];
  const subtitles: MediaFile[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const s = await stat(fullPath).catch(() => null);
    if (!s) continue;

    if (s.isFile()) {
      const file = classifyFile(dir, entry);
      if (file) {
        if (file.kind === 'video') videos.push(file);
        else subtitles.push(file);
      }
    } else if (s.isDirectory() && hasMediaExtension(entry)) {
      // Download tool pattern: directory named like a media file
      const subEntries = await readdir(fullPath).catch(() => [] as string[]);
      for (const subEntry of subEntries) {
        const subStat = await stat(path.join(fullPath, subEntry)).catch(() => null);
        if (subStat?.isFile()) {
          const file = classifyFile(fullPath, subEntry);
          if (file) {
            if (file.kind === 'video') videos.push(file);
            else subtitles.push(file);
          }
        }
      }
    }
  }

  // Sort by filename for consistent ordering
  videos.sort((a, b) => a.filename.localeCompare(b.filename));
  subtitles.sort((a, b) => a.filename.localeCompare(b.filename));

  return { videos, subtitles };
}

/**
 * Pair videos with their subtitle files.
 * Strategy: subtitle stem must match video stem exactly.
 * Each video can have multiple subtitles (different languages).
 */
export function pairFiles(videos: MediaFile[], subtitles: MediaFile[]): MediaFileGroup[] {
  const groups: MediaFileGroup[] = [];

  if (videos.length === 1) {
    // Single video: assign all subtitles to it
    groups.push({ video: videos[0], subtitles: [...subtitles] });
  } else {
    for (const video of videos) {
      const matched = subtitles.filter((sub) => sub.stem === video.stem);
      groups.push({ video, subtitles: matched });
    }
  }

  return groups;
}

/**
 * Get orphan subtitles that don't match any video.
 */
export function getOrphanSubtitles(videos: MediaFile[], subtitles: MediaFile[]): MediaFile[] {
  const videoStems = new Set(videos.map((v) => v.stem));
  return subtitles.filter((sub) => !videoStems.has(sub.stem));
}
