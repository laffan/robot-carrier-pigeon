/**
 * The activity log shown in the console (components/Console.svelte): what the
 * app does, as it does it. Kept in memory only, newest last, capped at MAX
 * entries. Nothing here leaves the device.
 *
 * Tags group the lines: "action" (something you did), "mail" (mailbox
 * calls), "net" (HTTP requests), "sync" (list loads and refreshes), "compose",
 * "auth", "settings", "app" and "error".
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  /** Epoch milliseconds. */
  t: number;
  level: LogLevel;
  tag: string;
  msg: string;
}

const MAX = 1500;

class ActivityLog {
  entries = $state.raw<LogEntry[]>([]);
  private seq = 0;
  private pending: LogEntry[] = [];
  private scheduled = false;

  add(level: LogLevel, tag: string, msg: string) {
    this.pending.push({ id: ++this.seq, t: Date.now(), level, tag, msg });
    // A refresh can log dozens of lines at once: publish them together.
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      const next = this.entries.concat(this.pending);
      this.pending = [];
      this.entries = next.length > MAX ? next.slice(next.length - MAX) : next;
    });
  }

  debug(tag: string, msg: string) {
    this.add("debug", tag, msg);
  }
  info(tag: string, msg: string) {
    this.add("info", tag, msg);
  }
  warn(tag: string, msg: string) {
    this.add("warn", tag, msg);
  }
  error(tag: string, msg: string) {
    this.add("error", tag, msg);
  }

  clear() {
    this.pending = [];
    this.entries = [];
  }

  /** The log as plain text, for copying. */
  text(entries: LogEntry[] = this.entries): string {
    return entries.map((e) => `${clock(e.t)} ${e.level.toUpperCase().padEnd(5)} ${e.tag.padEnd(8)} ${e.msg}`).join("\n");
  }
}

export const log = new ActivityLog();

/** HH:MM:SS.mmm in local time. */
export function clock(t: number): string {
  const d = new Date(t);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** Milliseconds since `start` (from performance.now()), for log lines. */
export function since(start: number): string {
  const ms = performance.now() - start;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Query parameters that carry credentials; their values never reach the log. */
const SECRET_PARAMS = /^(token|access_token|refresh_token|id_token|code|code_verifier|client_secret|key)$/i;

/** host + path + query for a log line, with credential parameters blanked. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (SECRET_PARAMS.test(k)) u.searchParams.set(k, "…");
    const q = u.searchParams.toString();
    return u.host + u.pathname + (q ? "?" + decodeURIComponent(q) : "");
  } catch {
    return url.split("?")[0];
  }
}

/** Uncaught errors and rejected promises go to the log too. */
export function captureGlobalErrors() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => log.error("error", e.message || "Uncaught error"));
  window.addEventListener("unhandledrejection", (e) => log.error("error", `Unhandled: ${errorText(e.reason)}`));
}
