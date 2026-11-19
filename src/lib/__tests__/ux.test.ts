import { beforeEach, describe, expect, it } from "vitest";
import { redactUrl } from "../log.svelte";
import { DEFAULTS, DEFAULT_TABS, settings } from "../settings.svelte";
import { WHEEL_IDLE, wheelStep } from "../wheel";

let clock = 1_000_000;
function wheel(deltaX: number, deltaY: number, gap = 16, extra: WheelEventInit = {}): WheelEvent {
  clock += gap;
  const e = new WheelEvent("wheel", { deltaX, deltaY, ...extra });
  Object.defineProperty(e, "timeStamp", { value: clock });
  return e;
}

describe("trackpad gestures", () => {
  it("locks a gesture to the axis it starts moving along", () => {
    const a = wheelStep(wheel(-3, 1, WHEEL_IDLE + 50));
    expect(a?.axis).toBeNull();
    const b = wheelStep(wheel(-9, 1));
    expect(b).toMatchObject({ axis: "x", first: true, dx: 12, dy: -2 });
    // Later vertical drift doesn't change the axis.
    const c = wheelStep(wheel(0, 30));
    expect(c).toMatchObject({ axis: "x", first: false, gesture: b!.gesture });
  });

  it("starts a new gesture after a pause", () => {
    const a = wheelStep(wheel(0, -20, WHEEL_IDLE + 50));
    const b = wheelStep(wheel(0, -20, WHEEL_IDLE + 50));
    expect(a).toMatchObject({ axis: "y", first: true, dy: 20 });
    expect(b!.gesture).toBe(a!.gesture + 1);
  });

  it("gives the same step for the same event and ignores pinch zoom", () => {
    const e = wheel(0, -40, WHEEL_IDLE + 50);
    expect(wheelStep(e)).toBe(wheelStep(e));
    expect(wheelStep(wheel(0, 5, 16, { ctrlKey: true }))).toBeNull();
  });
});

describe("activity log", () => {
  it("blanks credentials in logged URLs", () => {
    expect(redactUrl("https://oauth2.googleapis.com/revoke?token=1//secret")).toBe("oauth2.googleapis.com/revoke?token=…");
    expect(redactUrl("https://gmail.googleapis.com/gmail/v1/users/me/threads?labelIds=INBOX&q=-category:social")).toBe(
      "gmail.googleapis.com/gmail/v1/users/me/threads?labelIds=INBOX&q=-category:social",
    );
  });
});

describe("settings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to swipe left = archive, swipe right = delete", () => {
    expect(DEFAULTS.swipeLeft).toBe("archive");
    expect(DEFAULTS.swipeRight).toBe("trash");
  });

  it("moves settings saved with the old swipe defaults to the new ones", async () => {
    localStorage.setItem("kv:settings", JSON.stringify({ ...DEFAULTS, version: undefined, swipeRight: "archive", swipeLeft: "trash" }));
    await settings.load();
    expect(settings.value).toMatchObject({ swipeLeft: "archive", swipeRight: "trash", version: 2 });
  });

  it("keeps swipe actions chosen since", async () => {
    localStorage.setItem("kv:settings", JSON.stringify({ ...DEFAULTS, version: undefined, swipeRight: "pin", swipeLeft: "trash" }));
    await settings.load();
    expect(settings.value).toMatchObject({ swipeLeft: "trash", swipeRight: "pin" });
    localStorage.setItem("kv:settings", JSON.stringify({ ...DEFAULTS, swipeRight: "archive", swipeLeft: "trash" }));
    await settings.load();
    expect(settings.value).toMatchObject({ swipeLeft: "trash", swipeRight: "archive" });
  });

  it("gives each account Gmail's default tabs until set, and none for an old Everything inbox", async () => {
    localStorage.setItem("kv:settings", JSON.stringify({ inboxTabs: { "a@x.com": ["CATEGORY_UPDATES"] } }));
    await settings.load();
    expect(settings.tabsFor("a@x.com")).toEqual(["CATEGORY_UPDATES"]);
    expect(settings.tabsFor("b@x.com")).toEqual(DEFAULT_TABS);
    localStorage.setItem("kv:settings", JSON.stringify({ inboxType: "everything" }));
    await settings.load();
    expect(settings.tabsFor("b@x.com")).toEqual([]);
  });
});
