/**
 * Agent-v3 replies may carry invisible citation tags (`<ref id="knowledge:2"/>`
 * and the resolved `<ref type="knowledge" id="…"/>` form). The backend strips
 * them from every PERSISTED row, but live stream deltas arrive raw — and
 * RichText renders with rehype-raw, which would otherwise inject the tag as a
 * real DOM element. Strip complete tags plus a trailing PARTIAL tag (a tag
 * still being streamed char-by-char), so nothing citation-shaped ever flashes.
 */
export function stripCitationRefs(text: string): string {
  return (
    text
      // The end-of-message citation REPORT block (which-part/why/useful) —
      // complete, then an unterminated one still streaming in.
      .replace(/<citations>[\s\S]*?<\/citations>/g, '')
      .replace(/<citations[\s\S]*$/, '')
      // Complete tags — the model-facing ref form, the resolved typed form,
      // and stray <cite/> lines outside a block.
      .replace(/<(?:ref|cite)\s[^>]*?\/?>/g, '')
      // A tag cut mid-stream at the end of the buffer ("<re", "<ref id=\"kno…,
      // "<citation"). A bare trailing "<" is left alone — it may be legitimate
      // text and only flashes for one frame while streaming.
      .replace(/<r(?:e(?:f[^>]*)?)?$/, '')
      .replace(/<c(?:i(?:t(?:a(?:t(?:i(?:o(?:n(?:s)?)?)?)?)?)?(?:e[^>]*)?)?)?$/, '')
      .trimEnd()
  );
}
