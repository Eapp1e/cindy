import { spawnSync } from 'node:child_process';

/**
 * Git 追踪文件清单的读取上限。
 *
 * 默认 1 MiB（Node 的 `maxBuffer` 缺省值）在 2026-10 时已被本仓突破：
 * `git ls-files -z` 的输出约 1.05 MB，`spawnSync` 于是以 `ENOBUFS` 结束、
 * `status` 为 `null`，guard 只看到「exit null」就退出，扫描根本没跑。
 * 64 MiB 给清单留出约 60 倍余量，同时仍是一个有界值——真出问题时报错而不是
 * 静默通过。
 */
export const TRACKED_FILES_MAX_BYTES = 64 * 1024 * 1024;

/** Git 追踪文件清单读取失败的明确错误，调用方据此区分「读不到清单」与「清单为空」。 */
export class TrackedFilesError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = 'TrackedFilesError';
  }
}

/**
 * 读取仓库里被 Git 追踪的文件名。
 *
 * 失败（spawn 出错、退出码非 0）一律抛错，绝不返回空数组:空清单会让下游的
 * 逐文件检查全部跳过，看起来像「没有违规」，实际是门禁失效。
 */
export function readTrackedFiles({ spawnSyncImpl = spawnSync, maxBuffer = TRACKED_FILES_MAX_BYTES } = {}) {
  const listed = spawnSyncImpl('git', ['ls-files', '-z'], { encoding: 'buffer', maxBuffer });
  if (listed.error) {
    throw new TrackedFilesError(`git ls-files failed: ${listed.error.message}`, { cause: listed.error });
  }
  if (listed.status !== 0) {
    const stderr = listed.stderr?.toString('utf8').trim() ?? '';
    throw new TrackedFilesError(`git ls-files failed with exit ${listed.status ?? 'null'}${stderr ? `\n${stderr}` : ''}`);
  }
  return listed.stdout.toString('utf8').split('\0').filter(Boolean);
}
