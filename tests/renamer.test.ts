import { describe, expect, it } from 'vitest';
import { sanitizeFilename, formatEpisodeFilename, formatMovieFilename, buildRenamePlan, buildMovieRenamePlan } from '../src/renamer.js';
import type { MediaFile, MediaFileGroup, TmdbEpisode } from '../src/types.js';

describe('sanitizeFilename', () => {
  it('removes illegal characters', () => {
    expect(sanitizeFilename('What: Is This?')).toBe('What Is This');
    expect(sanitizeFilename('A/B\\C*D')).toBe('ABCD');
    expect(sanitizeFilename('Title "Quoted"')).toBe('Title Quoted');
    expect(sanitizeFilename('A <B> |C|')).toBe('A B C');
  });

  it('collapses whitespace', () => {
    expect(sanitizeFilename('Hello   World')).toBe('Hello World');
  });

  it('trims', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello');
  });
});

describe('formatEpisodeFilename', () => {
  it('formats standard episode', () => {
    expect(formatEpisodeFilename('Show', 1, 1, 'Pilot', '.mkv')).toBe(
      'Show - S01E01 - Pilot.mkv',
    );
  });

  it('formats with language suffix', () => {
    expect(formatEpisodeFilename('Show', 1, 1, 'Pilot', '.ass', 'zh-cn')).toBe(
      'Show - S01E01 - Pilot.zh-cn.ass',
    );
  });

  it('pads season and episode numbers', () => {
    expect(formatEpisodeFilename('Show', 2, 10, 'Title', '.mp4')).toBe(
      'Show - S02E10 - Title.mp4',
    );
  });

  it('handles empty episode title', () => {
    expect(formatEpisodeFilename('Show', 1, 1, '', '.mkv')).toBe('Show - S01E01.mkv');
  });

  it('sanitizes show name and episode title', () => {
    expect(formatEpisodeFilename('Show: Special', 0, 1, 'What?', '.mkv')).toBe(
      'Show Special - S00E01 - What.mkv',
    );
  });

  it('formats specials with S00', () => {
    expect(formatEpisodeFilename('Show', 0, 3, 'OVA', '.mkv')).toBe(
      'Show - S00E03 - OVA.mkv',
    );
  });
});

describe('formatMovieFilename', () => {
  it('formats with year', () => {
    expect(formatMovieFilename('Argo', '2012', '.mkv')).toBe('Argo (2012).mkv');
  });

  it('formats without year', () => {
    expect(formatMovieFilename('Argo', undefined, '.mkv')).toBe('Argo.mkv');
  });

  it('formats with language suffix', () => {
    expect(formatMovieFilename('Argo', '2012', '.srt', 'zh-cn')).toBe('Argo (2012).zh-cn.srt');
  });

  it('sanitizes movie name', () => {
    expect(formatMovieFilename('What: Is This?', '2020', '.mkv')).toBe('What Is This (2020).mkv');
  });
});

describe('buildMovieRenamePlan', () => {
  function makeGroup(videoName: string, subs: Array<{ name: string; lang?: string }>): MediaFileGroup {
    const video: MediaFile = {
      path: `/media/${videoName}`,
      filename: videoName,
      ext: '.mkv',
      kind: 'video',
      stem: videoName.replace('.mkv', ''),
    };
    const subtitles: MediaFile[] = subs.map((s) => ({
      path: `/media/${s.name}`,
      filename: s.name,
      ext: s.name.endsWith('.ass') ? '.ass' : '.srt',
      kind: 'subtitle' as const,
      langSuffix: s.lang,
      stem: video.stem,
    }));
    return { video, subtitles };
  }

  it('builds plan for movie with year', () => {
    const groups = [makeGroup('argo.2012.bluray.mkv', [])];
    const plan = buildMovieRenamePlan(groups, '逃离德黑兰', 68734, '2012');

    expect(plan.mediaType).toBe('movie');
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].newPath).toBe('/media/逃离德黑兰 (2012).mkv');
  });

  it('builds plan for movie with subtitles', () => {
    const groups = [makeGroup('argo.mkv', [
      { name: 'argo.zh-cn.srt', lang: 'zh-cn' },
      { name: 'argo.en.srt', lang: 'en' },
    ])];
    const plan = buildMovieRenamePlan(groups, 'Argo', 68734, '2012');

    expect(plan.entries).toHaveLength(3);
    expect(plan.entries[0].newPath).toBe('/media/Argo (2012).mkv');
    expect(plan.entries[1].newPath).toBe('/media/Argo (2012).zh-cn.srt');
    expect(plan.entries[2].newPath).toBe('/media/Argo (2012).en.srt');
  });
});

describe('buildRenamePlan', () => {
  function makeGroup(videoName: string, subs: Array<{ name: string; lang?: string }>): MediaFileGroup {
    const video: MediaFile = {
      path: `/media/${videoName}`,
      filename: videoName,
      ext: '.mkv',
      kind: 'video',
      stem: videoName.replace('.mkv', ''),
    };
    const subtitles: MediaFile[] = subs.map((s) => ({
      path: `/media/${s.name}`,
      filename: s.name,
      ext: s.name.endsWith('.ass') ? '.ass' : '.srt',
      kind: 'subtitle' as const,
      langSuffix: s.lang,
      stem: video.stem,
    }));
    return { video, subtitles };
  }

  const episodes: TmdbEpisode[] = [
    { episodeNumber: 1, seasonNumber: 1, name: 'The Journey Begins' },
    { episodeNumber: 2, seasonNumber: 1, name: 'A New Dawn' },
    { episodeNumber: 3, seasonNumber: 1, name: 'The Final Battle' },
  ];

  it('builds plan for videos with subtitles', () => {
    const groups = [
      makeGroup('ep01.mkv', [{ name: 'ep01.zh-cn.ass', lang: 'zh-cn' }]),
      makeGroup('ep02.mkv', []),
    ];

    const plan = buildRenamePlan(groups, episodes, 'Frieren', 209867, 1, 0);

    expect(plan.entries).toHaveLength(3); // 2 videos + 1 subtitle
    expect(plan.entries[0].newPath).toBe('/media/Frieren - S01E01 - The Journey Begins.mkv');
    expect(plan.entries[1].newPath).toBe('/media/Frieren - S01E01 - The Journey Begins.zh-cn.ass');
    expect(plan.entries[2].newPath).toBe('/media/Frieren - S01E02 - A New Dawn.mkv');
  });

  it('applies offset', () => {
    const groups = [makeGroup('ep01.mkv', [])];
    const plan = buildRenamePlan(groups, episodes, 'Show', 1, 1, 1);

    // offset=1 means first file maps to episode at index 1 (ep 2)
    expect(plan.entries[0].newPath).toContain('S01E02');
  });

  it('stops when TMDB episodes run out', () => {
    const groups = [
      makeGroup('ep01.mkv', []),
      makeGroup('ep02.mkv', []),
      makeGroup('ep03.mkv', []),
      makeGroup('ep04.mkv', []),
      makeGroup('ep05.mkv', []),
    ];

    const plan = buildRenamePlan(groups, episodes, 'Show', 1, 1, 0);
    expect(plan.entries).toHaveLength(3); // only 3 episodes in TMDB
  });

  it('handles multiple subtitle languages', () => {
    const groups = [
      makeGroup('ep01.mkv', [
        { name: 'ep01.zh-cn.ass', lang: 'zh-cn' },
        { name: 'ep01.en.srt', lang: 'en' },
      ]),
    ];

    const plan = buildRenamePlan(groups, episodes, 'Show', 1, 1, 0);
    expect(plan.entries).toHaveLength(3); // 1 video + 2 subs
    expect(plan.entries[1].newPath).toContain('.zh-cn.ass');
    expect(plan.entries[2].newPath).toContain('.en.srt');
  });
});
