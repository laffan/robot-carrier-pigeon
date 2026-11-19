import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// src-tauri/Info.ios.plist is merged into the generated iOS Info.plist. These
// keys fix trackpad scrolls arriving with swapped axes on a landscape iPad.
// Vitest runs from the project root.
const plist = readFileSync(resolve(process.cwd(), "src-tauri/Info.ios.plist"), "utf8");
const compact = plist.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, "");

describe("Info.ios.plist", () => {
  it("is well-formed XML", () => {
    const doc = new DOMParser().parseFromString(plist, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  });

  it("opts into native trackpad input", () => {
    expect(compact).toContain("<key>UIApplicationSupportsIndirectInputEvents</key><true/>");
  });

  it("uses Tao's single-window scene lifecycle", () => {
    expect(compact).toContain("<key>UIApplicationSceneManifest</key><dict>");
    expect(compact).toContain("<key>UIApplicationSupportsMultipleScenes</key><false/>");
    expect(compact).toContain("<key>UIWindowSceneSessionRoleApplication</key><array>");
    expect(compact).toContain("<key>UISceneDelegateClassName</key><string>TaoSceneDelegate</string>");
  });
});
