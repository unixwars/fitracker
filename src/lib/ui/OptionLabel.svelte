<script lang="ts">
  // Content of a dropdown <option>. Browsers with customizable selects (appearance: base-select) show the monochrome
  // SVG; every other browser only keeps the text, so the emoji is the fallback. See .opt-* in app.css.
  let { path, emoji, text }: { path: string; emoji: string; text: string } = $props()
</script>

<svg class="opt-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={path} /></svg><span class="opt-emoji">{emoji}</span> {text}
