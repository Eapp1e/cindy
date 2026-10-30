import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRACKED_FILES_MAX_BYTES,
  TrackedFilesError,
  readTrackedFiles,
} from '../lib/tracked-files.mjs';

function fakeSpawn(listed) {
  const calls = [];
  const spawnSyncImpl = (command, args, options) => {
    calls.push({ command, args, options });
    return listed;
  };
  return { calls, spawnSyncImpl };
}

test('readTrackedFiles: 按 NUL 切分并丢掉空段', () => {
  const { spawnSyncImpl } = fakeSpawn({ status: 0, stdout: Buffer.from('a.md\0dir/b.ts\0') });
  assert.deepEqual(readTrackedFiles({ spawnSyncImpl }), ['a.md', 'dir/b.ts']);
});

test('readTrackedFiles: 用有界缓冲读取，不再踩 1 MiB 默认值', () => {
  const { calls, spawnSyncImpl } = fakeSpawn({ status: 0, stdout: Buffer.from('') });
  readTrackedFiles({ spawnSyncImpl });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['ls-files', '-z']);
  assert.equal(calls[0].options.maxBuffer, TRACKED_FILES_MAX_BYTES);
  assert.ok(TRACKED_FILES_MAX_BYTES > 1024 * 1024);
});

test('readTrackedFiles: 超过缓冲上限时报错而不是当成空清单', () => {
  const enobufs = Object.assign(new Error('spawnSync git ENOBUFS'), { code: 'ENOBUFS' });
  const { spawnSyncImpl } = fakeSpawn({ status: null, stdout: Buffer.alloc(0), error: enobufs });
  assert.throws(
    () => readTrackedFiles({ spawnSyncImpl }),
    (error) => error instanceof TrackedFilesError && /ENOBUFS/.test(error.message) && error.cause === enobufs,
  );
});

test('readTrackedFiles: 非 0 退出码带上 stderr 报错', () => {
  const { spawnSyncImpl } = fakeSpawn({
    status: 128,
    stdout: Buffer.alloc(0),
    stderr: Buffer.from('fatal: not a git repository\n'),
  });
  assert.throws(
    () => readTrackedFiles({ spawnSyncImpl }),
    (error) =>
      error instanceof TrackedFilesError &&
      /exit 128/.test(error.message) &&
      /not a git repository/.test(error.message),
  );
});
