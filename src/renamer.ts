import { rename, readdir, rmdir } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import type { MediaFileGroup, TmdbEpisode, RenameEntry, RenamePlan, Messages } from './types.js';

// ── Filename formatting ──

const ILLEGAL_CHARS = /[\/\\:*?"<>|]/g;

export function sanitizeFilename(name: string): string {
  return name.replace(ILLEGAL_CHARS, '').replace(/\s+/g, ' ').trim();
}

export function formatEpisodeFilename(
  showName: string,
  season: number,
  episode: number,
  episodeTitle: string,
  ext: string,
  langSuffix?: string,
): string {
  const s = String(season).padStart(2, '0');
  const e = String(episode).padStart(2, '0');
  const title = sanitizeFilename(episodeTitle);
  const lang = langSuffix ? `.${langSuffix}` : '';
  const safeName = sanitizeFilename(showName);
  return title
    ? `${safeName} - S${s}E${e} - ${title}${lang}${ext}`
    : `${safeName} - S${s}E${e}${lang}${ext}`;
}

export function formatMovieFilename(
  movieName: string,
  year: string | undefined,
  ext: string,
  langSuffix?: string,
): string {
  const safeName = sanitizeFilename(movieName);
  const lang = langSuffix ? `.${langSuffix}` : '';
  return year
    ? `${safeName} (${year})${lang}${ext}`
    : `${safeName}${lang}${ext}`;
}

// ── Plan generation ──

export function buildRenamePlan(
  groups: MediaFileGroup[],
  episodes: TmdbEpisode[],
  showName: string,
  tmdbId: number,
  season: number,
  offset: number,
  targetDir?: string,
): RenamePlan {
  const entries: RenameEntry[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const epIndex = i + offset;
    const episode = episodes[epIndex];

    if (!episode) break; // no more TMDB episodes

    const dir = targetDir ?? path.dirname(group.video.path);

    // Rename video
    const newVideoName = formatEpisodeFilename(
      showName, season, episode.episodeNumber, episode.name, group.video.ext,
    );
    entries.push({
      oldPath: group.video.path,
      newPath: path.join(dir, newVideoName),
    });

    // Rename subtitles
    for (const sub of group.subtitles) {
      const newSubName = formatEpisodeFilename(
        showName, season, episode.episodeNumber, episode.name, sub.ext, sub.langSuffix,
      );
      entries.push({
        oldPath: sub.path,
        newPath: path.join(dir, newSubName),
      });
    }
  }

  return { showName, tmdbId, mediaType: 'tv', season, entries };
}

export function buildMovieRenamePlan(
  groups: MediaFileGroup[],
  movieName: string,
  tmdbId: number,
  year?: string,
  targetDir?: string,
): RenamePlan {
  const entries: RenameEntry[] = [];

  for (const group of groups) {
    const dir = targetDir ?? path.dirname(group.video.path);

    const newVideoName = formatMovieFilename(movieName, year, group.video.ext);
    entries.push({
      oldPath: group.video.path,
      newPath: path.join(dir, newVideoName),
    });

    for (const sub of group.subtitles) {
      const newSubName = formatMovieFilename(movieName, year, sub.ext, sub.langSuffix);
      entries.push({
        oldPath: sub.path,
        newPath: path.join(dir, newSubName),
      });
    }
  }

  return { showName: movieName, tmdbId, mediaType: 'movie', entries };
}

// ── Preview ──

export function printPlan(plan: RenamePlan, msg: Messages): void {
  console.log();
  console.log(chalk.bold(msg.renamePlan));
  console.log();

  for (const entry of plan.entries) {
    const oldName = path.basename(entry.oldPath);
    const newName = path.basename(entry.newPath);
    console.log(`  ${chalk.red(oldName)}`);
    console.log(`    ${msg.arrow} ${chalk.green(newName)}`);
  }

  console.log();
}

// ── Execute ──

export async function executePlan(plan: RenamePlan): Promise<number> {
  let count = 0;
  const dirsToClean = new Set<string>();

  for (const entry of plan.entries) {
    const oldDir = path.dirname(entry.oldPath);
    const newDir = path.dirname(entry.newPath);
    await rename(entry.oldPath, entry.newPath);
    count++;
    // Track source directories that differ from target (nested files moved up)
    if (oldDir !== newDir) {
      dirsToClean.add(oldDir);
    }
  }

  // Remove empty source directories
  for (const dir of dirsToClean) {
    try {
      const remaining = await readdir(dir);
      if (remaining.length === 0) {
        await rmdir(dir);
      }
    } catch { /* ignore */ }
  }

  return count;
}
