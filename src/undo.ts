import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import type { RenameHistory, RenamePlan, Messages } from './types.js';

const HISTORY_FILE = '.bangumi-renamer-history.json';

export function historyPath(dir: string): string {
  return path.join(dir, HISTORY_FILE);
}

export async function saveHistory(plan: RenamePlan, dir: string): Promise<void> {
  const history: RenameHistory = {
    version: 1,
    timestamp: new Date().toISOString(),
    tmdbId: plan.tmdbId,
    showName: plan.showName,
    entries: plan.entries.map((e) => ({
      old: path.basename(e.oldPath),
      new: path.basename(e.newPath),
    })),
  };
  await writeFile(historyPath(dir), JSON.stringify(history, null, 2), 'utf8');
}

export async function loadHistory(dir: string): Promise<RenameHistory | null> {
  const fp = historyPath(dir);
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(await readFile(fp, 'utf8'));
  } catch {
    return null;
  }
}

export async function executeUndo(
  dir: string,
  msg: Messages,
  opts: { yes?: boolean; json?: boolean } = {},
): Promise<void> {
  const { yes = false, json: jsonMode = false } = opts;
  const log = jsonMode ? (() => {}) : console.log.bind(console);

  const history = await loadHistory(dir);
  if (!history) {
    if (jsonMode) {
      console.log(JSON.stringify({ command: 'undo', success: false, error: msg.noHistory }));
    } else {
      console.log(chalk.yellow(msg.noHistory));
    }
    process.exitCode = 2;
    return;
  }

  if (!yes) {
    log(chalk.bold(msg.undoTitle));
    log();
    for (const entry of history.entries) {
      log(`  ${chalk.red(entry.new)}`);
      log(`    ${msg.arrow} ${chalk.green(entry.old)}`);
    }
    log();

    const ok = await confirm({ message: msg.undoConfirm, default: true });
    if (!ok) {
      process.exitCode = 1;
      return;
    }
  }

  let count = 0;
  const entries: Array<{ old: string; new: string }> = [];
  for (const entry of history.entries) {
    const from = path.join(dir, entry.new);
    const to = path.join(dir, entry.old);
    if (!existsSync(from)) {
      log(chalk.yellow(msg.undoSkipNotFound(entry.new)));
      continue;
    }
    if (existsSync(to)) {
      log(chalk.yellow(msg.undoSkipExists(entry.old)));
      continue;
    }
    await rename(from, to);
    entries.push({ old: entry.new, new: entry.old });
    count++;
  }

  await unlink(historyPath(dir));

  if (jsonMode) {
    console.log(JSON.stringify({
      command: 'undo', success: true, filesReverted: count, entries,
    }));
  } else {
    console.log(chalk.green(msg.undoComplete(count)));
  }
}
