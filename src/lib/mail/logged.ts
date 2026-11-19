/**
 * Wraps a mailbox backend so that every call it makes shows in the activity
 * log: the method, a short form of its arguments, what came back and how long
 * it took. Message bodies and attachments are summarised by size, never
 * written out.
 */
import { errorText, log, plural, since } from "../log.svelte";
import type { MailBackend } from "./types";

function short(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.length > 48 ? `‹${kb(v.length)}›` : JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.length > 3 ? `[${v.slice(0, 3).map(short).join(", ")}, +${v.length - 3}]` : `[${v.map(short).join(", ")}]`;
  if (v instanceof Map) return "";
  if (typeof v === "object") {
    const parts = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined && x !== "")
      .map(([k, x]) => `${k}=${short(x)}`);
    return `{${parts.join(" ")}}`;
  }
  return "";
}

function kb(chars: number): string {
  return chars < 1024 ? `${chars} B` : `${(chars / 1024).toFixed(1)} KB`;
}

function result(v: unknown): string {
  if (v === undefined) return "ok";
  if (typeof v === "string") return kb(v.length);
  if (Array.isArray(v)) return plural(v.length, "item");
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.threads)) return `${plural(o.threads.length, "thread")}${o.nextPageToken ? " (more)" : ""}`;
    if (Array.isArray(o.messages)) return plural(o.messages.length, "message");
    if (typeof o.draftId === "string") return `draft ${o.draftId}`;
    if (typeof o.id === "string") return `id ${o.id}`;
  }
  return "ok";
}

export function logged(backend: MailBackend): MailBackend {
  const who = backend.email;
  return new Proxy(backend, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string") return value;
      return (...args: unknown[]) => {
        const start = performance.now();
        const call = `${prop}(${args.map(short).filter(Boolean).join(", ")})`;
        const out = value.apply(target, args);
        if (!(out instanceof Promise)) return out;
        return out.then(
          (r: unknown) => {
            log.info("mail", `${who} ${call} → ${result(r)} · ${since(start)}`);
            return r;
          },
          (e: unknown) => {
            log.error("mail", `${who} ${call} failed: ${errorText(e)} · ${since(start)}`);
            throw e;
          },
        );
      };
    },
  });
}
