import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isAnimation, type TmdbSearchResult, type TmdbShowDetail, type TmdbMovieDetail, type TmdbEpisode, type TmdbSeason, type Messages } from './types.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const CONFIG_DIR = path.join(os.homedir(), '.config', 'bangumi-renamer');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

async function tmdbFetch(endpoint: string, apiKey: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid TMDB API key');
    if (res.status === 404) throw new Error('Not found on TMDB');
    throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ── API Key resolution ──

export async function resolveApiKey(msg: Messages, yes = false): Promise<string> {
  // 1. Env var
  const envKey = process.env['TMDB_API_KEY'];
  if (envKey) return envKey;

  // 2. Config file
  if (existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
      if (config.apiKey) return config.apiKey;
    } catch { /* ignore */ }
  }

  // 3. Prompt
  const apiKey = await input({ message: msg.apiKeyPrompt });
  if (!apiKey.trim()) throw new Error(msg.errorApiKeyRequired);

  const save = yes || await confirm({ message: msg.apiKeySave, default: true });
  if (save) {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify({ apiKey: apiKey.trim() }, null, 2), 'utf8');
    console.log(chalk.green(msg.apiKeySaved));
  }

  return apiKey.trim();
}

// ── Search ──

export async function searchTv(apiKey: string, query: string, lang: string): Promise<TmdbSearchResult[]> {
  const data = await tmdbFetch('/search/tv', apiKey, { query, language: lang }) as {
    results: Array<{
      id: number;
      name: string;
      original_name?: string;
      first_air_date?: string;
      overview: string;
      popularity: number;
      genre_ids: number[];
    }>;
  };

  return data.results.map((r) => ({
    id: r.id,
    name: r.name,
    originalName: r.original_name,
    firstAirDate: r.first_air_date,
    overview: r.overview,
    popularity: r.popularity,
    mediaType: 'tv' as const,
    genreIds: r.genre_ids ?? [],
  }));
}

export async function searchMovie(apiKey: string, query: string, lang: string): Promise<TmdbSearchResult[]> {
  const data = await tmdbFetch('/search/movie', apiKey, { query, language: lang }) as {
    results: Array<{
      id: number;
      title: string;
      original_title?: string;
      release_date?: string;
      overview: string;
      popularity: number;
      genre_ids: number[];
    }>;
  };

  return data.results.map((r) => ({
    id: r.id,
    name: r.title,
    originalName: r.original_title,
    firstAirDate: r.release_date,
    overview: r.overview,
    popularity: r.popularity,
    mediaType: 'movie' as const,
    genreIds: r.genre_ids ?? [],
  }));
}

export async function selectShow(apiKey: string, msg: Messages, queryHint?: string, lang = 'en-US'): Promise<{ id: number; name: string; mediaType: 'tv' | 'movie' }> {
  let query = queryHint;

  while (true) {
    if (!query) {
      query = await input({ message: msg.enterQuery });
    }

    console.log(chalk.dim(msg.searchingTmdb));
    const [tvResults, movieResults] = await Promise.all([
      searchTv(apiKey, query, lang),
      searchMovie(apiKey, query, lang),
    ]);
    const results = [...tvResults, ...movieResults].sort((a, b) => b.popularity - a.popularity);

    if (results.length === 0) {
      console.log(chalk.yellow(msg.noResults));
      query = undefined;
      continue;
    }

    const choices = results.slice(0, 10).map((r) => {
      const tag = r.mediaType === 'movie' ? msg.movieTag
        : isAnimation(r) ? msg.tvAnimationTag : msg.tvTag;
      const year = r.firstAirDate ? ` (${r.firstAirDate.slice(0, 4)})` : '';
      return {
        name: `${tag} ${r.name}${year} — TMDB #${r.id}`,
        value: `${r.mediaType}:${r.id}`,
        description: r.overview?.slice(0, 80),
      };
    });

    choices.push(
      { name: chalk.dim(`↻ ${msg.searchAgain}`), value: '__search__', description: '' },
      { name: chalk.dim(`# ${msg.enterTmdbId}`), value: '__manual__', description: '' },
    );

    const selected = await select({ message: msg.selectShow, choices });

    if (selected === '__search__') {
      query = undefined;
      continue;
    }

    if (selected === '__manual__') {
      const manualId = await input({ message: 'TMDB ID:' });
      const id = parseInt(manualId, 10);
      if (isNaN(id)) throw new Error(msg.errorInvalidTmdbId);
      const mediaType = await select({
        message: msg.selectMediaType,
        choices: [
          { name: msg.tvTag, value: 'tv' as const },
          { name: msg.movieTag, value: 'movie' as const },
        ],
      });
      if (mediaType === 'movie') {
        const detail = await getMovieDetail(apiKey, id, lang);
        return { id, name: detail.title, mediaType: 'movie' };
      }
      const detail = await getShowDetail(apiKey, id, lang);
      return { id, name: detail.name, mediaType: 'tv' };
    }

    const [mediaType, idStr] = selected.split(':') as ['tv' | 'movie', string];
    const id = parseInt(idStr, 10);
    const match = results.find((r) => r.id === id && r.mediaType === mediaType);
    return { id, name: match!.name, mediaType };
  }
}

// ── Show & Season details ──

export async function getShowDetail(apiKey: string, tmdbId: number, lang: string): Promise<TmdbShowDetail> {
  const data = await tmdbFetch(`/tv/${tmdbId}`, apiKey, { language: lang }) as {
    id: number;
    name: string;
    seasons: Array<{
      season_number: number;
      name: string;
      episode_count: number;
      air_date?: string;
    }>;
  };

  return {
    id: data.id,
    name: data.name,
    seasons: data.seasons.map((s) => ({
      seasonNumber: s.season_number,
      name: s.name,
      episodeCount: s.episode_count,
      airDate: s.air_date,
    })),
  };
}

export async function getMovieDetail(apiKey: string, tmdbId: number, lang: string): Promise<TmdbMovieDetail> {
  const data = await tmdbFetch(`/movie/${tmdbId}`, apiKey, { language: lang }) as {
    id: number;
    title: string;
    release_date?: string;
  };

  return {
    id: data.id,
    title: data.title,
    releaseDate: data.release_date,
  };
}

export async function selectSeason(apiKey: string, tmdbId: number, msg: Messages, seasonHint?: number, lang = 'en-US'): Promise<TmdbSeason> {
  const detail = await getShowDetail(apiKey, tmdbId, lang);

  if (seasonHint !== undefined) {
    const match = detail.seasons.find((s) => s.seasonNumber === seasonHint);
    if (match) return match;
    console.log(chalk.yellow(msg.seasonNotFound(seasonHint)));
  }

  const choices = detail.seasons.map((s) => ({
    name: s.seasonNumber === 0
      ? `${msg.specials} (${s.episodeCount} ${msg.episodes})`
      : `S${String(s.seasonNumber).padStart(2, '0')} — ${s.name} (${s.episodeCount} ${msg.episodes})`,
    value: s.seasonNumber.toString(),
  }));

  const selected = await select({ message: msg.selectSeason, choices });
  return detail.seasons.find((s) => s.seasonNumber === parseInt(selected, 10))!;
}

// ── Episodes ──

export async function getEpisodes(apiKey: string, tmdbId: number, seasonNumber: number, lang: string): Promise<TmdbEpisode[]> {
  const data = await tmdbFetch(`/tv/${tmdbId}/season/${seasonNumber}`, apiKey, { language: lang }) as {
    episodes: Array<{
      episode_number: number;
      season_number: number;
      name: string;
      air_date?: string;
    }>;
  };

  return data.episodes.map((e) => ({
    episodeNumber: e.episode_number,
    seasonNumber: e.season_number,
    name: e.name,
    airDate: e.air_date,
  }));
}
