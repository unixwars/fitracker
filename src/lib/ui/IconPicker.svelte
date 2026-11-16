<script lang="ts">
  import type { Snippet } from 'svelte'
  import { messages } from '../messages'
  import { iconPicker } from './iconPickerState.svelte'
  import { isEmoji } from '../overrides'

  let { id, label, current, glyph, onpick }: { id: string; label: string; current: string; glyph?: Snippet; onpick: (emoji: string) => void } = $props()
  const CHOICES = ['🏦', '💳', '💵', '🐷', '📈', '👥', '🏠', '🛒', '🚗', '✈️', '🍽️', '🎮', '🏥', '👕', '🎁', '💼', '💰', '📚', '🐶', '🔧']
  const open = $derived(iconPicker.open === id)
  let typed = $state('')
  const pick = (e: string) => { iconPicker.open = ''; typed = ''; onpick(e) }
</script>

<svelte:window onpointerdown={(e) => { if (open && !(e.target as Element | null)?.closest?.('.iconpick')) iconPicker.open = '' }} />

<span class="iconpick" role="presentation" onkeydown={(e) => { if (e.key === 'Escape') iconPicker.open = '' }}>
  <button class="secondary iconbtn" aria-label={`${messages.chooseIcon}: ${label}`} aria-expanded={open} onclick={() => (iconPicker.open = open ? '' : id)}>{#if glyph}{@render glyph()}{:else}{current}{/if}</button>
  {#if open}
    <span class="iconmenu" role="group" aria-label={messages.chooseIcon}>
      {#each CHOICES as c (c)}<button class="secondary" onclick={() => pick(c)}>{c}</button>{/each}
      <input aria-label={messages.iconInput} placeholder={messages.iconInput} bind:value={typed} oninput={() => { if (isEmoji(typed.trim())) pick(typed.trim()) }} />
      <button class="secondary" onclick={() => pick('')}>{messages.resetIcon}</button>
    </span>
  {/if}
</span>
