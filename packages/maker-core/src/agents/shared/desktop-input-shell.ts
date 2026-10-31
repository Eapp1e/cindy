/**
 * Shell commands that synthesize desktop keyboard / mouse input outside the
 * Cindy Computer Use driver.
 *
 * Why this exists: when the driver refuses an input (Electron text fields,
 * simulator windows, a focused system sheet), models have fallen back to
 * `osascript … keystroke`, clipboard paste via ⌘V, `cliclick`, or hand-written
 * CGEvent scripts. Those bypass every guard in `cindy_computer` (target window,
 * secure fields, remote-input yield, user-activity yield) and in practice typed
 * into the wrong window (2026-10-31 audit, CU-014). The one desktop input entry
 * is `cindy_computer`; a refusal there is a result to report, not to work around.
 *
 * Only input synthesis is listed. Read-only desktop queries (`screencapture`,
 * `osascript … get name of …`, `lsappinfo`) stay untouched.
 */

const SHELL_DESKTOP_INPUT_PATTERNS: readonly RegExp[] = [
  // AppleScript / JXA keyboard and mouse synthesis. Only System Events (or the
  // osascript wrapper) combined with an input verb; reading window titles via
  // System Events is not input.
  /\bSystem Events\b[\s\S]{0,400}?\b(?:keystroke|key code|key down|key up|click)\b/i,
  /\bosascript\b[\s\S]{0,400}?\b(?:keystroke|key code|key down|key up)\b/i,
  // macOS third-party click / key CLIs.
  /(?:^|[\s|&;(`$])cliclick\b/,
  // CoreGraphics event synthesis from inline Swift / Python / JXA.
  /\bCGEventPost\b|\bCGEventCreate(?:Mouse|Keyboard|ScrollWheel)Event\b|\bCGEvent\s*\(\s*(?:mouseEventSource|keyboardEventSource|scrollWheelEvent2Source)/,
  // Linux / Windows equivalents.
  /(?:^|[\s|&;(`$])(?:xdotool|ydotool|xte)\s+(?:key|type|click|mousemove|mousedown|mouseup)\b/,
  /\bSendKeys\b|\bSendInput\b|\bmouse_event\b|\bkeybd_event\b/,
  // The driver binary itself: same engine, but the native CLI / MCP skips the
  // Cindy session, guards and result verification.
  /(?:^|[\s|&;(`$/])cua-driver\s+(?!--version\b|version\b|status\b|health\b)[a-z]/,
];

/** True when a shell command synthesizes desktop keyboard or mouse input. */
export function isShellDesktopInputCommand(command: string): boolean {
  if (typeof command !== "string" || command.length === 0) return false;
  return SHELL_DESKTOP_INPUT_PATTERNS.some((pattern) => pattern.test(command));
}

export const SHELL_DESKTOP_INPUT_DENIAL_CODE =
  "SHELL_DESKTOP_INPUT_NOT_ALLOWED";

/** Model-facing refusal; English like the other guard reasons. */
export const SHELL_DESKTOP_INPUT_DENIAL_REASON =
  `${SHELL_DESKTOP_INPUT_DENIAL_CODE}: desktop keyboard and mouse input goes only through the ` +
  "cindy_computer tools (set_value, type_text, click, press_key, hotkey). Shell-synthesized " +
  "input (osascript System Events keystroke/click, clipboard paste via keystroke, cliclick, " +
  "CGEvent scripts, the cua-driver CLI) is not an alternative: it ignores the target window, " +
  "secure fields and the person using this computer. If cindy_computer refused or could not " +
  "deliver the input, report that result and stop instead of simulating keys.";
