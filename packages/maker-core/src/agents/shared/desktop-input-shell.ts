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
  // Optionally path-qualified (/opt/homebrew/bin/cliclick); the name must end the
  // token so a file such as docs/cliclick-notes.md is not a command.
  /(?:^|[\s|&;(`$])(?:\S*\/)?cliclick(?=\s|$)/,
  // CoreGraphics event synthesis from inline Swift / Python / JXA.
  /\bCGEventPost\b|\bCGEventCreate(?:Mouse|Keyboard|ScrollWheel)Event\b|\bCGEvent\s*\(\s*(?:mouseEventSource|keyboardEventSource|scrollWheelEvent2Source)/,
  // Linux / Windows equivalents.
  /(?:^|[\s|&;(`$])(?:\S*\/)?(?:xdotool|ydotool|xte)\s+(?:key|type|click|mousemove|mousedown|mouseup)\b/,
  /\bSendKeys\b|\bSendInput\b|\bmouse_event\b|\bkeybd_event\b/,
  // The driver binary itself: same engine, but the native CLI / MCP skips the
  // Cindy session, guards and result verification.
  /(?:^|[\s|&;(`$/])cua-driver\s+(?!--version\b|version\b|status\b|health\b)[a-z]/,
];

const READ_ONLY_HEADS: ReadonlySet<string> = new Set([
  "rg",
  "grep",
  "egrep",
  "fgrep",
  "zgrep",
  "ag",
  "ack",
  "head",
  "tail",
  "less",
  "more",
  "bat",
  "wc",
]);
const READ_ONLY_GIT_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "grep",
  "log",
  "show",
  "diff",
  "blame",
  "commit",
  "tag",
]);
const COMMAND_WRAPPERS: ReadonlySet<string> = new Set([
  "sudo",
  "command",
  "env",
  "time",
  "nohup",
  "nice",
  "exec",
]);

/**
 * A top-level pipeline segment whose command only reads or searches text, so the
 * names inside its arguments (`rg CGEventPost src`, `git commit -m "… SendKeys"`)
 * are data, not input being synthesized. `cat` counts only without a redirect or
 * heredoc: `cat > click.swift <<EOF` writes the script that would be run next.
 */
function isReadOnlySegment(segment: string): boolean {
  const tokens = segment
    .trim()
    .replace(/^[({\s]+/, "")
    .split(/\s+/);
  let index = 0;
  while (
    index < tokens.length &&
    (/^\w+=\S*$/.test(tokens[index]!) || COMMAND_WRAPPERS.has(tokens[index]!))
  )
    index += 1;
  const head = (tokens[index] ?? "").split("/").pop() ?? "";
  if (READ_ONLY_HEADS.has(head)) return true;
  if (head === "cat") return !/>|<</.test(segment);
  if (head === "git") {
    const sub =
      tokens
        .slice(index + 1)
        .find((token) => !token.startsWith("-") && !token.includes("/")) ?? "";
    return READ_ONLY_GIT_SUBCOMMANDS.has(sub);
  }
  return false;
}

const SUBSTITUTION_RE =
  /\$\(([^()]*(?:\([^()]*\)[^()]*)*)\)|`([^`]*)`|[<>]\(([^()]*)\)/g;

/** Bodies of `$(…)`, backtick and process substitutions in a segment (one nesting level). */
function substitutionBodies(segment: string): string[] {
  const bodies: string[] = [];
  for (const match of segment.matchAll(SUBSTITUTION_RE)) {
    bodies.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  // An unbalanced `$(` that the pattern could not extract: keep the segment rather than trust it.
  if (bodies.length === 0 && /\$\(|`|[<>]\(/.test(segment))
    bodies.push(segment);
  return bodies;
}

/** True when a shell command synthesizes desktop keyboard or mouse input. */
export function isShellDesktopInputCommand(command: string): boolean {
  if (typeof command !== "string" || command.length === 0) return false;
  // Drop read-only segments, then scan what remains as one text: AppleScript and
  // JXA payloads span `;` and `|` inside their quotes, so remaining segments are
  // rejoined rather than judged one by one.
  // A read-only segment still runs the command substitutions in its arguments
  // (`rg "$(osascript -e '… keystroke …')" .`), so those bodies are scanned too.
  const executedParts: string[] = [];
  for (const segment of command.split(/&&|\|\||;|\|/)) {
    if (!isReadOnlySegment(segment)) executedParts.push(segment);
    else executedParts.push(...substitutionBodies(segment));
  }
  const executed = executedParts.join(" ; ");
  return SHELL_DESKTOP_INPUT_PATTERNS.some((pattern) => pattern.test(executed));
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
