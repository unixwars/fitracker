<script lang="ts">
  import { messages } from '../messages'
  import { isEmoji } from '../overrides'

  let { label, current, onpick }: { label: string; current: string; onpick: (emoji: string) => void } = $props()
  const CHOICES = ['🏦', '💳', '💵', '🐷', '📈', '👥', '🏠', '🛒', '🚗', '✈️', '🍽️', '🎮', '🏥', '👕', '🎁', '💼', '💰', '📚', '🐶', '🔧']
  let open = $state(false)
  let typed = $state('')
  const pick = (e: string) => { open = false; typed = ''; onpick(e) }
</script>

<span class="iconpick">
  <button class="secondary iconbtn" aria-label={`${messages.chooseIcon}: ${label}`} aria-expanded={open} onclick={() => (open = !open)}>{current}</button>
  {#if open}
    <span class="iconmenu" role="group" aria-label={messages.chooseIcon}>
      {#each CHOICES as c (c)}<button class="secondary" onclick={() => pick(c)}>{c}</button>{/each}
      <input aria-label={messages.iconInput} placeholder={messages.iconInput} bind:value={typed} oninput={() => { if (isEmoji(typed.trim())) pick(typed.trim()) }} />
      <button class="secondary" onclick={() => pick('')}>{messages.resetIcon}</button>
    </span>
  {/if}
</span>
