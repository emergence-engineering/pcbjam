import { afterEach, describe, expect, it } from "vitest";
import {
  getChromeHidden,
  isChromeToggleHotkey,
  resetChromeHiddenForTests,
  setChromeHidden,
  subscribeChromeHidden,
  toggleChromeHidden,
} from "./chrome-visibility";

/**
 * Chrome-visibility store (features/mobile, Figma-like "hide UI" toggle):
 * module-global hidden/shown state every shell consumer shares, defaulting to
 * the device signal (isMobileMode) and toggled at runtime by the floating
 * button / Cmd+\ hotkey. Plus the pure hotkey matcher.
 */

afterEach(() => resetChromeHiddenForTests());

describe("chrome-visibility store", () => {
  it("defaults via device detection (desktop-like test env → shown)", () => {
    // node env has no window: the lazy default must resolve to "not hidden"
    // rather than crash on the missing global.
    expect(getChromeHidden()).toBe(false);
  });

  it("set + toggle flip the state", () => {
    setChromeHidden(true);
    expect(getChromeHidden()).toBe(true);
    toggleChromeHidden();
    expect(getChromeHidden()).toBe(false);
    toggleChromeHidden();
    expect(getChromeHidden()).toBe(true);
  });

  it("notifies subscribers on every change, in subscription order", () => {
    const seen: string[] = [];
    subscribeChromeHidden(() => seen.push(`a:${getChromeHidden()}`));
    subscribeChromeHidden(() => seen.push(`b:${getChromeHidden()}`));

    setChromeHidden(true);
    toggleChromeHidden();
    expect(seen).toEqual(["a:true", "b:true", "a:false", "b:false"]);
  });

  it("does not notify on a no-op set", () => {
    setChromeHidden(false); // resolves the lazy default to false
    let calls = 0;
    subscribeChromeHidden(() => calls++);
    setChromeHidden(false);
    expect(calls).toBe(0);
  });

  it("unsubscribe stops notifications", () => {
    let calls = 0;
    const off = subscribeChromeHidden(() => calls++);
    setChromeHidden(true);
    off();
    setChromeHidden(false);
    expect(calls).toBe(1);
  });
});

describe("isChromeToggleHotkey", () => {
  const key = (over: Partial<Parameters<typeof isChromeToggleHotkey>[0]>) => ({
    key: "\\",
    code: "Backslash",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    ...over,
  });

  it("accepts Ctrl+\\ and Cmd+\\", () => {
    expect(isChromeToggleHotkey(key({ ctrlKey: true }))).toBe(true);
    expect(isChromeToggleHotkey(key({ metaKey: true }))).toBe(true);
  });

  it("accepts the physical Backslash key even when the layout maps it elsewhere", () => {
    // e.g. HU layout: physical US-backslash key produces "ű"
    expect(isChromeToggleHotkey(key({ ctrlKey: true, key: "ű" }))).toBe(true);
  });

  it("accepts a layout-produced backslash on a different physical key", () => {
    expect(isChromeToggleHotkey(key({ ctrlKey: true, code: "IntlBackslash" }))).toBe(true);
  });

  it("rejects bare \\ (that's KiCad's Decrease Via Size)", () => {
    expect(isChromeToggleHotkey(key({}))).toBe(false);
  });

  it("rejects AltGr-produced backslash (ctrl+alt while typing \\ in a field)", () => {
    expect(isChromeToggleHotkey(key({ ctrlKey: true, altKey: true }))).toBe(false);
  });

  it("rejects key auto-repeat (held hotkey must not strobe the layout)", () => {
    expect(isChromeToggleHotkey(key({ ctrlKey: true, repeat: true }))).toBe(false);
  });

  it("rejects other ctrl shortcuts", () => {
    expect(isChromeToggleHotkey(key({ ctrlKey: true, key: "s", code: "KeyS" }))).toBe(false);
  });
});
