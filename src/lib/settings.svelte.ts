import { kvGet, kvSet } from "./platform";
import { applyNightVision } from "./nightVision";
import { log } from "./log.svelte";

export type SwipeAction = "archive" | "trash" | "read" | "pin" | "none";

/** Gmail's category tabs besides Primary, in Gmail's order. */
export const INBOX_TABS = ["CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_FORUMS"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];
/** The tabs a Gmail account has out of the box (Updates and Forums are opt-in). */
export const DEFAULT_TABS: InboxTab[] = ["CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS"];
/** Gmail search names (category:…) of the tabs. */
export const TAB_SEARCH: Record<InboxTab, string> = {
  CATEGORY_SOCIAL: "social",
  CATEGORY_PROMOTIONS: "promotions",
  CATEGORY_UPDATES: "updates",
  CATEGORY_FORUMS: "forums",
};

export interface Settings {
  /** Finger (or two fingers on a trackpad) moving right across a row. */
  swipeRight: SwipeAction;
  /** Finger (or two fingers on a trackpad) moving left across a row. */
  swipeLeft: SwipeAction;
  /** Seconds to hold a message before sending; 0 disables undo. */
  undoSendSeconds: number;
  /**
   * Before per-account tabs: "everything" meant no tabs. Now only the fallback
   * for accounts without an inboxTabs entry.
   */
  inboxType: "primary" | "everything";
  /**
   * The category tabs turned on in Gmail for each account (keyed by email).
   * As in Gmail, Primary is the Inbox without those tabs: mail from tabs that
   * are off stays in Primary. No tabs: the Inbox shows everything.
   */
  inboxTabs: Record<string, InboxTab[]>;
  loadRemoteImages: boolean;
  theme: "system" | "light" | "dark";
  /** The app drawn in red alone (lib/nightVision.ts): the list header's eye. */
  nightVision: boolean;
  defaultReply: "reply" | "replyAll";
  /** Markdown signatures keyed by send-as address. */
  signatures: Record<string, string>;
  /** Colour chosen for each account (keyed by email); defaults by position. */
  accountColors: Record<string, string>;
  /** Whether a signature was imported/edited at least once (otherwise Gmail's is used). */
  signaturesCustomized: Record<string, boolean>;
  /** Browser for links in messages: a preset id from lib/browser.ts, or "custom". */
  browser: string;
  /** URL template used when `browser` is "custom". */
  browserTemplate: string;
  /** The activity console at the bottom of the window (sidebar toggle). */
  consoleOpen: boolean;
  /** Its height in pixels. */
  consoleHeight: number;
  /** Bumped when a changed default should reach settings saved earlier (see load). */
  version: number;
}

export const DEFAULTS: Settings = {
  swipeLeft: "archive",
  swipeRight: "trash",
  undoSendSeconds: 5,
  inboxType: "primary",
  inboxTabs: {},
  loadRemoteImages: true,
  theme: "system",
  nightVision: false,
  defaultReply: "reply",
  signatures: {},
  accountColors: {},
  signaturesCustomized: {},
  browser: "system",
  browserTemplate: "",
  consoleOpen: false,
  consoleHeight: 260,
  version: 2,
};

class SettingsStore {
  value = $state<Settings>({ ...DEFAULTS });
  loaded = $state(false);
  /** Whether the system currently prefers dark mode. */
  systemDark = $state(false);

  /** The account's Gmail category tabs (see Settings.inboxTabs). */
  tabsFor(email: string): InboxTab[] {
    return this.value.inboxTabs[email] ?? (this.value.inboxType === "everything" ? [] : DEFAULT_TABS);
  }

  /** Effective appearance, combining the setting with the system preference. */
  get dark(): boolean {
    const t = this.value.theme;
    return t === "dark" || (t === "system" && this.systemDark);
  }

  constructor() {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      this.systemDark = mq.matches;
      mq.addEventListener?.("change", (e) => (this.systemDark = e.matches));
    }
  }

  async load() {
    const saved = await kvGet<Partial<Settings>>("settings");
    const merged = { ...DEFAULTS, ...(saved ?? {}), version: DEFAULTS.version };
    // Starring was replaced by pinning.
    for (const k of ["swipeLeft", "swipeRight"] as const) if ((merged[k] as string) === "star") merged[k] = "pin";
    // Version 2 swapped the swipe defaults to left = archive, right = delete.
    // Settings saved before then still hold the old defaults; move those over.
    if (saved && (saved.version ?? 1) < 2 && merged.swipeRight === "archive" && merged.swipeLeft === "trash") {
      merged.swipeLeft = "archive";
      merged.swipeRight = "trash";
    }
    this.value = merged;
    log.info("settings", `Loaded: swipe left = ${merged.swipeLeft}, swipe right = ${merged.swipeRight}, theme = ${merged.theme}${merged.nightVision ? ", night vision on" : ""}`);
    this.loaded = true;
    this.applyTheme();
  }

  async update(patch: Partial<Settings>) {
    const changed = (Object.keys(patch) as (keyof Settings)[]).filter((k) => patch[k] !== this.value[k] && k !== "consoleHeight");
    if (changed.length) log.info("settings", changed.map((k) => describe(k, patch[k])).join(", "));
    this.value = { ...this.value, ...patch };
    this.applyTheme();
    await kvSet("settings", $state.snapshot(this.value));
  }

  /** The theme, and night vision over it. */
  applyTheme() {
    if (typeof document === "undefined") return;
    const t = this.value.theme;
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    applyNightVision(this.value.nightVision);
  }
}

export const settings = new SettingsStore();

/** One changed setting for the activity log; long values (signatures, colour maps) by name only. */
function describe(key: keyof Settings, value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const s = String(value);
    return s.length > 40 ? `${key} changed` : `${key} = ${s}`;
  }
  return `${key} changed`;
}

export const SWIPE_LABELS: Record<SwipeAction, string> = {
  archive: "Archive",
  trash: "Delete",
  read: "Mark read / unread",
  pin: "Pin / unpin",
  none: "None",
};

/** Account colours: distinct, readable in light and dark mode. */
export const ACCOUNT_COLORS = ["#4a7dff", "#e58a3c", "#33a873", "#a865d8", "#e0566f", "#2aa6b8", "#c8a228", "#7d8b9b"];
