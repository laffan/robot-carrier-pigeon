<script lang="ts">
  import { onDestroy } from "svelte";
  import DOMPurify from "dompurify";
  import { Ellipsis } from "@lucide/svelte";
  import { textToHtml } from "../lib/mail/mime";
  import { browserTarget } from "../lib/browser";
  import { isIOS, isTauri, openExternal } from "../lib/platform";
  import { toasts } from "../lib/toasts.svelte";
  import { composer } from "../lib/compose.svelte";
  import { settings } from "../lib/settings.svelte";
  import { backgroundOf, fixContrast, invert, type RGB } from "../lib/contrast";
  import { log } from "../lib/log.svelte";

  interface Props {
    html?: string;
    text?: string;
    loadImages: boolean;
  }
  let { html, text, loadImages }: Props = $props();

  let frame = $state<HTMLIFrameElement>();
  let height = $state(40);
  let showQuoted = $state(false);
  let allowImages = $state(false);

  const QUOTE_SELECTORS = [
    "div.gmail_quote",
    "blockquote.gmail_quote",
    "blockquote[type=cite]",
    "div.yahoo_quoted",
    "div#divRplyFwdMsg",
    "div#appendonsend",
    "div.moz-cite-prefix",
    "blockquote.protonmail_quote",
  ].join(",");

  const prepared = $derived.by(() => {
    const source = html ?? textToHtml(text ?? "");
    let blocked = 0;
    const images = loadImages || allowImages;
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
      if (!images && node.tagName === "IMG") {
        const src = node.getAttribute("src") ?? "";
        if (/^https?:/i.test(src)) {
          node.removeAttribute("src");
          node.removeAttribute("srcset");
          blocked++;
        }
      }
      if (!images && node.hasAttribute("background")) {
        node.removeAttribute("background");
        blocked++;
      }
    });
    const clean = DOMPurify.sanitize(source, {
      FORBID_TAGS: ["form", "input", "button", "select", "textarea", "meta", "base", "link", "script", "iframe", "object", "embed"],
      FORBID_ATTR: ["autofocus"],
      FORCE_BODY: true,
      ADD_ATTR: ["target"],
    });
    DOMPurify.removeHook("afterSanitizeAttributes");

    const doc = new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${clean}</body></html>`, "text/html");
    // Collapse trailing quoted history behind a "•••" toggle, like Gmail.
    let hasQuote = false;
    const quote = doc.body.querySelector(QUOTE_SELECTORS) as HTMLElement | null;
    if (quote) {
      const range = doc.createRange();
      range.setStartAfter(quote);
      range.setEndAfter(doc.body.lastChild!);
      const after = range.toString().replace(/\s+/g, "");
      const before = doc.createRange();
      before.setStartBefore(doc.body.firstChild!);
      before.setEndBefore(quote);
      if (after.length < 40 && before.toString().trim().length > 0) {
        hasQuote = true;
        quote.setAttribute("data-carrier-quote", "");
        // Outlook-style: everything after the separator is history.
        let n = quote.nextSibling;
        while (n) {
          const next = n.nextSibling;
          if (n.nodeType === 1) (n as HTMLElement).setAttribute("data-carrier-quote", "");
          else if (n.nodeType === 3 && !n.textContent?.trim()) {
            /* whitespace */
          } else {
            const span = doc.createElement("span");
            span.setAttribute("data-carrier-quote", "");
            n.replaceWith(span);
            span.append(n);
          }
          n = next;
        }
      }
    }
    // Plain-text quoting ("> ...") at the end of text messages.
    if (!html && text) {
      const pre = doc.body.querySelector("div");
      if (pre) {
        const lines = (pre.textContent ?? "").split("\n");
        let i = lines.length - 1;
        while (i >= 0 && (lines[i].startsWith(">") || !lines[i].trim())) i--;
        if (i >= 0 && /wrote:\s*$/.test(lines[i])) i--;
        if (i < lines.length - 3 && i >= 0) {
          hasQuote = true;
          const head = lines.slice(0, i + 1).join("\n");
          const tail = lines.slice(i + 1).join("\n");
          pre.innerHTML = textToHtml(head).replace(/^<div[^>]*>|<\/div>$/g, "") + `<span data-carrier-quote>\n${textToHtml(tail).replace(/^<div[^>]*>|<\/div>$/g, "")}</span>`;
        }
      }
    }
    const rich = !!html && /bgcolor|background(-color)?\s*:|<table/i.test(clean);
    return { body: doc.body.innerHTML, hasQuote, blocked, rich };
  });

  const dark = $derived(settings.dark);

  /**
   * Messages always sit directly on the app background (no white card).
   * - Simple messages take the app's text colours.
   * - Designed (HTML/newsletter) messages keep their own colours in light
   *   mode; in dark mode they are colour-inverted with images restored, so
   *   dark text on a white design becomes light text on the dark background.
   * The frame's color-scheme always matches the app's: when they differ,
   * WebKit paints an opaque white backdrop behind the frame.
   * After loading, text that still has too little contrast with what it's
   * drawn on (dark on dark, light on light) is recoloured (lib/contrast.ts).
   */
  const srcdoc = $derived.by(() => {
    const p = prepared;
    const scheme = dark ? "dark" : "light";
    const invert = dark && p.rich;
    const fg = dark && !p.rich ? "#e6e6e6" : "#1d1d1f";
    const link = dark && !p.rich ? "#8fb0ff" : "#1a5fb4";
    const bg = "transparent";
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="${scheme}">
<style>
  :root{color-scheme:${scheme};}
  html,body{margin:0;padding:0;background:${bg};}
  ${invert ? "html{filter:invert(1) hue-rotate(180deg);} img,video,picture,svg,[style*='background-image'],[background]{filter:invert(1) hue-rotate(180deg);}" : ""}
  body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;color:${fg};
       word-wrap:break-word;overflow-wrap:anywhere;-webkit-text-size-adjust:100%;}
  a{color:${link}}
  img{max-width:100%;height:auto}
  pre{white-space:pre-wrap}
  blockquote{margin:0 0 0 .8ex;padding-left:1ex;border-left:1px solid ${dark && !p.rich ? "#555" : "#ccc"}}
  [data-carrier-quote]{display:none !important}
  .show-quoted [data-carrier-quote]{display:revert !important}
  table{max-width:none}
</style></head><body>${p.body}</body></html>`;
  });

  function measure() {
    const f = frame;
    const doc = f?.contentDocument;
    if (!f || !doc?.body) return;
    const body = doc.body;
    body.style.zoom = "";
    const width = f.clientWidth;
    const content = Math.max(doc.documentElement.scrollWidth, body.scrollWidth);
    if (content > width + 4 && width > 0) {
      body.style.zoom = String(width / content);
    }
    const h = Math.ceil(doc.documentElement.getBoundingClientRect().height);
    height = Math.max(20, h);
  }

  /**
   * Recolours text that is too close to its background: the message's own
   * colours, or the app's background showing through. Runs on load and when
   * quoted text is revealed (hidden text isn't checked).
   */
  function adjustContrast() {
    const f = frame;
    const doc = f?.contentDocument;
    const win = doc?.defaultView;
    if (!f || !doc?.body || !win) return;
    const fallback: RGB = dark ? [18, 18, 19] : [255, 255, 255];
    const page = backgroundOf(f, fallback, window) ?? fallback;
    // Under the dark theme's invert filter, the document's colours are the
    // inverse of what's shown, so compare against the inverse of the page.
    const inverted = win.getComputedStyle(doc.documentElement).filter.includes("invert");
    const n = fixContrast(doc, inverted ? invert(page) : page);
    if (n) log.debug("ui", `Recoloured ${n === 1 ? "1 low-contrast passage" : `${n} low-contrast passages`} in a message`);
  }

  /** Watches the loaded document's height; replaced on each load and dropped with the frame. */
  let resize: ResizeObserver | undefined;
  onDestroy(() => resize?.disconnect());

  function onload() {
    const doc = frame?.contentDocument;
    if (!doc) return;
    doc.documentElement.classList.toggle("show-quoted", showQuoted);
    adjustContrast();
    measure();
    // A frame that's gone (or reloaded with new content) must not stay
    // observed: Chromium then reports a ResizeObserver loop on every frame.
    resize?.disconnect();
    resize = new ResizeObserver(() => measure());
    resize.observe(doc.documentElement);
    doc.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
    doc.addEventListener("click", (e) => {
      const a = (e.target as Element)?.closest?.("a");
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute("href") ?? "";
      if (/^mailto:/i.test(href)) composer.openMailto(href);
      else if (/^https?:|^tel:/i.test(href)) openLink(href);
    });
  }

  /** Opens a link, sending web links to the browser chosen in Settings. */
  async function openLink(href: string) {
    const target = browserTarget(href, settings.value, isTauri && !isIOS);
    if (target.url === href && !target.openWith) return openExternal(href).catch((e) => toasts.error(String(e)));
    try {
      await openExternal(target.url, target.openWith);
    } catch {
      // The browser may not be installed: fall back to the system default.
      toasts.show("Couldn't open the chosen browser. Opened the default one instead.");
      await openExternal(href).catch((e) => toasts.error(String(e)));
    }
  }

  $effect(() => {
    frame?.contentDocument?.documentElement.classList.toggle("show-quoted", showQuoted);
    if (showQuoted) adjustContrast();
    measure();
  });
</script>

{#if prepared.blocked > 0 && !allowImages}
  <button class="images" onclick={() => (allowImages = true)}>Show images</button>
{/if}
<iframe
  bind:this={frame}
  title="Message"
  sandbox="allow-same-origin allow-popups"
  {srcdoc}
  {onload}
  style:height="{height}px"
  style:color-scheme={dark ? "dark" : "light"}
></iframe>
{#if prepared.hasQuote}
  <button class="quote" aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"} onclick={() => (showQuoted = !showQuoted)}>
    <Ellipsis size={16} strokeWidth={2} />
  </button>
{/if}

<style>
  iframe {
    display: block;
    width: 100%;
    border: none;
    background: transparent;
  }
  .quote {
    display: inline-flex;
    margin-top: 6px;
    padding: 0 8px;
    height: 20px;
    align-items: center;
    border-radius: 6px;
    background: var(--bg-3);
    color: var(--text-2);
  }
  .images {
    font-size: 13px;
    color: var(--accent);
    margin-bottom: 8px;
  }
</style>
