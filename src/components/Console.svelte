<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowDownToLine, Check, Copy, Eraser, X } from "@lucide/svelte";
  import { clock, log, type LogEntry } from "../lib/log.svelte";
  import { settings } from "../lib/settings.svelte";

  /**
   * The activity console: every line of lib/log.svelte.ts, full width along
   * the bottom of the window. Opened from the sidebar, beside Settings. The
   * rest of the app shrinks to sit above it (the --console-h variable).
   */

  type Filter = "all" | "actions" | "network" | "problems";
  const FILTERS: Filter[] = ["all", "actions", "network", "problems"];
  /** Mailbox calls and HTTP requests; "actions" is everything else. */
  const NETWORK = new Set(["net", "mail"]);

  let filter = $state<Filter>("all");
  let box = $state<HTMLDivElement>();
  /** Follow new lines while scrolled to the bottom. */
  let follow = $state(true);
  let copied = $state(false);
  let height = $state(clampHeight(settings.value.consoleHeight));
  let resizing = $state(false);

  function matches(e: LogEntry, f: Filter): boolean {
    if (f === "network") return NETWORK.has(e.tag);
    if (f === "actions") return !NETWORK.has(e.tag);
    if (f === "problems") return e.level === "warn" || e.level === "error";
    return true;
  }

  const shown = $derived(filter === "all" ? log.entries : log.entries.filter((e) => matches(e, filter)));

  function clampHeight(h: number): number {
    const max = typeof window === "undefined" ? 600 : Math.max(160, window.innerHeight * 0.8);
    return Math.round(Math.min(max, Math.max(120, h)));
  }

  // The rest of the layout makes room for the console.
  $effect(() => {
    document.documentElement.style.setProperty("--console-h", `${height}px`);
  });
  onMount(() => {
    const onResize = () => (height = clampHeight(height));
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      document.documentElement.style.removeProperty("--console-h");
    };
  });

  // Keep the newest line in view, unless scrolled up to read.
  $effect(() => {
    void shown;
    if (!follow || !box) return;
    const el = box;
    requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  });

  function onscroll() {
    if (!box) return;
    follow = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
  }

  function toBottom() {
    follow = true;
    box?.scrollTo({ top: box.scrollHeight });
  }

  function setFilter(f: Filter) {
    filter = f;
    follow = true;
  }

  async function copy() {
    const text = log.text(shown);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }

  /** Drag the top edge to resize. */
  function startResize(e: PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    resizing = true;
    const move = (ev: PointerEvent) => (height = clampHeight(startH + (startY - ev.clientY)));
    const end = () => {
      resizing = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      settings.update({ consoleHeight: height });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }
</script>

<section class="console" class:resizing style:height="{height}px" aria-label="Activity console">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="grip" onpointerdown={startResize} title="Drag to resize"></div>
  <header>
    <span class="title">activity</span>
    <div class="filters" role="tablist" aria-label="Show">
      {#each FILTERS as f (f)}
        <button role="tab" aria-selected={filter === f} class:on={filter === f} onclick={() => setFilter(f)}>{f}</button>
      {/each}
    </div>
    <span class="count">{shown.length}</span>
    <div class="tools">
      {#if !follow}
        <button aria-label="Jump to latest" title="Jump to latest" onclick={toBottom}><ArrowDownToLine size={15} strokeWidth={1.8} /></button>
      {/if}
      <button aria-label="Copy" title="Copy these lines" onclick={copy}>
        {#if copied}<Check size={15} strokeWidth={1.8} />{:else}<Copy size={15} strokeWidth={1.8} />{/if}
      </button>
      <button aria-label="Clear" title="Clear" onclick={() => log.clear()}><Eraser size={15} strokeWidth={1.8} /></button>
      <button aria-label="Close console" title="Close" onclick={() => settings.update({ consoleOpen: false })}><X size={15} strokeWidth={1.8} /></button>
    </div>
  </header>
  <div class="lines" bind:this={box} {onscroll} role="log" aria-live="off">
    {#each shown as e (e.id)}
      <div class="line {e.level}">
        <span class="time">{clock(e.t)}</span>
        <span class="tag tag-{e.tag}">{e.tag}</span>
        <span class="msg">{e.msg}</span>
      </div>
    {:else}
      <div class="line empty"><span class="msg">{log.entries.length ? "Nothing matches this filter." : "No activity yet."}</span></div>
    {/each}
    <div class="cursor" aria-hidden="true">›<span class="caret"></span></div>
  </div>
</section>

<style>
  /* A terminal: the same dark palette in light and dark themes. */
  .console {
    --c-bg: #0c0e0d;
    --c-bar: #141816;
    --c-line: #252b28;
    --c-text: #c9d1cb;
    --c-dim: #6f7a73;
    --c-debug: #8a958e;
    --c-warn: #e3b341;
    --c-error: #ff7b72;
    position: fixed;
    z-index: 30;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    background: var(--c-bg);
    color: var(--c-text);
    border-top: 1px solid var(--c-line);
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.5;
    padding-left: var(--safe-left);
    padding-right: var(--safe-right);
    padding-bottom: var(--safe-bottom);
    color-scheme: dark;
  }
  .grip {
    position: absolute;
    left: 0;
    right: 0;
    top: -4px;
    height: 9px;
    cursor: ns-resize;
    touch-action: none;
    z-index: 1;
  }
  .grip::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 7px;
    width: 36px;
    height: 3px;
    margin-left: -18px;
    border-radius: 2px;
    background: var(--c-line);
  }
  .resizing,
  .resizing * {
    cursor: ns-resize;
    -webkit-user-select: none;
    user-select: none;
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 32px;
    padding: 0 6px 0 14px;
    background: var(--c-bar);
    border-bottom: 1px solid var(--c-line);
  }
  .title {
    color: var(--c-dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
  }
  .filters {
    display: flex;
    gap: 2px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .filters button {
    padding: 2px 8px;
    border-radius: 5px;
    color: var(--c-dim);
    font-size: 12px;
    white-space: nowrap;
  }
  .filters button:hover {
    color: var(--c-text);
  }
  .filters button.on {
    background: var(--c-line);
    color: var(--c-text);
  }
  .count {
    color: var(--c-dim);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .tools {
    margin-left: auto;
    display: flex;
    gap: 2px;
  }
  .tools button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 26px;
    border-radius: 6px;
    color: var(--c-dim);
  }
  .tools button:hover {
    background: var(--c-line);
    color: var(--c-text);
  }
  .lines {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 6px 0 8px;
    -webkit-user-select: text;
    user-select: text;
  }
  .line {
    display: flex;
    gap: 10px;
    padding: 0 14px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .line:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .time {
    flex: none;
    color: var(--c-dim);
    font-variant-numeric: tabular-nums;
  }
  .tag {
    flex: none;
    width: 8ch;
    color: var(--c-dim);
  }
  .tag-action {
    color: #7ee787;
  }
  .tag-sync {
    color: #79c0ff;
  }
  .tag-mail {
    color: #d2a8ff;
  }
  .tag-compose {
    color: #ffa657;
  }
  .tag-auth,
  .tag-settings {
    color: #e3b341;
  }
  .tag-error {
    color: var(--c-error);
  }
  .msg {
    min-width: 0;
  }
  .debug .msg {
    color: var(--c-debug);
  }
  .warn .msg {
    color: var(--c-warn);
  }
  .error .msg {
    color: var(--c-error);
  }
  .empty .msg {
    color: var(--c-dim);
  }
  .cursor {
    padding: 0 14px;
    color: #7ee787;
  }
  .caret {
    display: inline-block;
    width: 7px;
    height: 13px;
    margin-left: 6px;
    vertical-align: -2px;
    background: #7ee787;
    animation: blink 1.1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  @media (max-width: 640px) {
    .time {
      display: none;
    }
  }
</style>
