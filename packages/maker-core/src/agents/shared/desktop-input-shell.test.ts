import { describe, expect, it } from "vitest";

import { classifyShellCommand } from "./auto-review.js";
import {
  isShellDesktopInputCommand,
  SHELL_DESKTOP_INPUT_DENIAL_REASON,
} from "./desktop-input-shell.js";

/**
 * Rule basis: CU-014 (2026-10-31 audit) — shell-simulated desktop input bypasses
 * every cindy_computer guard and typed into the wrong window. Gap: no shared
 * classifier existed; `osascript` only counted as a pipe executor. Tier: unit.
 */
describe("isShellDesktopInputCommand", () => {
  it.each([
    // the exact shapes seen in the audited transcripts
    `osascript -e 'tell application "System Events" to keystroke "/pr "'`,
    `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
    `osascript -e 'tell application "System Events" to key code 36'`,
    `osascript -e 'tell application "System Events" to tell process "Cindy" to click button 1 of window 1'`,
    `printf '%s' 'hello' | pbcopy; osascript -e 'tell application "System Events" to keystroke "v" using {command down}'`,
    `cliclick c:1460,645`,
    `swift /tmp/click.swift 100 200 # CGEventPost(.cghidEventTap, e)`,
    `python3 -c "import Quartz; e=Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (1,2), 0); Quartz.CGEventPost(0, e)"`,
    `xdotool type "hello"`,
    `powershell -Command "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`,
    `cua-driver click --pid 11629 --x 600 --y 320`,
    `/Users/dash/.local/bin/cua-driver type-text --pid 1 --text hi`,
    // path-qualified binaries (review: absolute paths bypassed the guard)
    `/opt/homebrew/bin/cliclick c:100,100`,
    `/usr/bin/xdotool key Return`,
    // payloads that carry separators inside quotes, and a script written then run
    `osascript -e 'tell application "System Events"; keystroke "x"; end tell'`,
    `osascript -l JavaScript -e 'ObjC.import("CoreGraphics"); $.CGEventPost(0, e)'`,
    `cat > /tmp/click.swift <<'EOF'\nlet e = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left)\nEOF`,
    `rg foo src && osascript -e 'tell application "System Events" to keystroke "a"'`,
    // review: a read-only head still executes the substitutions in its arguments
    `rg "$(osascript -e 'tell application "System Events" to keystroke "x"')" .`,
    "grep -r `cliclick c:1,1` src",
    // and a text writer piped into an interpreter is not a read-only segment
    `printf 'tell application "System Events" to keystroke "x"' | osascript`,
  ])("matches synthesized input: %s", (command) => {
    expect(isShellDesktopInputCommand(command)).toBe(true);
  });

  it.each([
    // read-only desktop queries and unrelated uses of the same words
    `osascript -e 'tell application "System Events" to get {name, unix id} of first application process whose frontmost is true'`,
    `osascript -e 'tell application "Terminal" to get name of every tab of window 1'`,
    `screencapture -x /tmp/full.png`,
    `lsappinfo front`,
    `git commit -m "fix keystroke handling in composer"`,
    `rg "keystroke" apps/desktop/src`,
    `cat docs/cliclick-notes.md`,
    // read-only search / history over files that merely mention the APIs (review)
    `rg 'CGEventPost' apps/desktop/src`,
    `grep -rn "SendKeys" packages | head`,
    `git grep -n CGEventCreateMouseEvent`,
    `git commit -m "fix osascript keystroke guard for cliclick and CGEventPost"`,
    `git -C /repo log --oneline -S SendInput`,
    `rg cliclick /opt/homebrew/bin/cliclick.md`,
    `rg "$(pwd)/CGEventPost" src`,
    `git log --grep=SendInput --since "$(date -v-7d +%F)"`,
    `cua-driver --version`,
    `cua-driver status`,
    `xcrun simctl io booted screenshot /tmp/sim.png`,
    `axe tap -x 100 -y 200 --udid ABC`,
    ``,
  ])("leaves non-input commands alone: %s", (command) => {
    expect(isShellDesktopInputCommand(command)).toBe(false);
  });

  it("routes synthesized input to the reviewer instead of auto-approving it", () => {
    expect(
      classifyShellCommand(
        `osascript -e 'tell application "System Events" to keystroke "a"'`,
        ["/repo"],
      ),
    ).toBe("prompt");
    expect(classifyShellCommand("cliclick c:10,10", ["/repo"])).toBe("prompt");
    expect(
      classifyShellCommand("screencapture -x /tmp/a.png", ["/repo"]),
    ).not.toBe("prompt-each-time");
  });

  it("names cindy_computer as the only entry in the denial reason", () => {
    expect(SHELL_DESKTOP_INPUT_DENIAL_REASON).toContain("cindy_computer");
    expect(SHELL_DESKTOP_INPUT_DENIAL_REASON).toContain(
      "SHELL_DESKTOP_INPUT_NOT_ALLOWED",
    );
  });
});
