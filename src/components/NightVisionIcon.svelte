<!-- Night vision's icon: an eye with a small star above it — seeing in
     the dark. The same glyph as in Hush, Zotero Helper and Snorkle,
     drawn to lucide's grid and props so it sits with the header's other
     icons. -->
<script lang="ts">
  let { size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M2.5 14C4.8 10 8.1 8 12 8s7.2 2 9.5 6c-2.3 4-5.6 6-9.5 6s-7.2-2-9.5-6Z" />
  <circle cx="12" cy="14" r="2.75" />
  <path d="M18.5 2.5v4M16.5 4.5h4" />
</svg>
