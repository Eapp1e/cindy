import { describe, expect, it } from 'vitest';
import type { HistoryMessageSource } from '../historyView.js';
import {
  HISTORY_WORK_LINE_LIMIT,
  HISTORY_WORK_LINE_MAX_BYTES,
  HISTORY_WORK_LINES_MAX_BYTES,
  projectHistoryWorkLines,
} from '../historyWorkLines.js';

/**
 * The module promises the per-line share is enough for the whole window:
 *   historyWorkLines.ts:25  "Each line fits its share of the window, so five lines always fit together."
 *   historyWorkLines.ts:189 "Every line is within its share, so this only guards the invariant itself."
 * A line may use its whole share, so the JSON array framing has to be reserved inside the
 * window budget. Otherwise five maximal lines overflow and the guard at :190 drops the oldest
 * line instead of only guarding the invariant.
 */

let sequence = 0;

function toolRow(input: unknown): HistoryMessageSource {
  sequence += 1;
  return {
    id: `m${sequence}`,
    clientId: `c${String(sequence).padStart(3, '0')}`,
    role: 'tool_use',
    content: { toolName: 'file_change', toolUseId: `t${sequence}`, input },
    createdAt: new Date(1_700_000_000_000 + sequence).toISOString(),
  };
}

function fileChange(pathLength: number): unknown {
  return {
    changes: [
      {
        path: 'a'.repeat(pathLength),
        kind: { type: 'update', move_path: 'a'.repeat(pathLength) },
        diff: '+x\n'.repeat(400),
      },
    ],
  };
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/** Widest path whose line still fits the documented per-line share. */
function widestFittingPath(): { length: number; bytes: number } {
  let best = { length: 0, bytes: 0 };
  for (let length = 1; length <= 400; length += 1) {
    sequence = 0;
    const [line] = projectHistoryWorkLines([toolRow(fileChange(length))], true);
    const lineBytes = bytes(line);
    if (lineBytes <= HISTORY_WORK_LINE_MAX_BYTES && lineBytes > best.bytes) {
      best = { length, bytes: lineBytes };
    }
  }
  return best;
}

describe('history work line byte budget', () => {
  it('reserves the JSON array framing so five share-sized lines fit the window', () => {
    const framing = 2 + (HISTORY_WORK_LINE_LIMIT - 1);
    expect(HISTORY_WORK_LINE_MAX_BYTES * HISTORY_WORK_LINE_LIMIT + framing).toBeLessThanOrEqual(
      HISTORY_WORK_LINES_MAX_BYTES,
    );
  });

  it('keeps all five lines when each one uses its whole share', () => {
    const widest = widestFittingPath();
    expect(widest.bytes).toBeLessThanOrEqual(HISTORY_WORK_LINE_MAX_BYTES);
    expect(widest.length).toBeGreaterThan(0);

    sequence = 0;
    const rows = Array.from({ length: HISTORY_WORK_LINE_LIMIT }, () => toolRow(fileChange(widest.length)));
    const lines = projectHistoryWorkLines(rows, true);

    expect(lines).toHaveLength(HISTORY_WORK_LINE_LIMIT);
    expect(bytes(lines)).toBeLessThanOrEqual(HISTORY_WORK_LINES_MAX_BYTES);
    // The newest line must survive: the guard is documented as never firing.
    expect(lines.at(-1)?.key).toBe('c005');
  });
});
