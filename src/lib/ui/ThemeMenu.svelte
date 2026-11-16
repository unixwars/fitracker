<script lang="ts">
  import type { AppState } from '../app.svelte'
  import type { Theme } from '../config'
  import { messages } from '../messages'

  let { app }: { app: AppState } = $props()
  let open = $state(false)
  const options: { value: Theme; label: string }[] = [
    { value: 'system', label: messages.themeSystem },
    { value: 'light', label: messages.themeLight },
    { value: 'dark', label: messages.themeDark },
  ]
  const pick = (value: Theme) => { open = false; app.setDevice({ theme: value }) }
</script>

<svelte:window onpointerdown={(e) => { if (open && !(e.target as Element | null)?.closest?.('.thememenu')) open = false }} />

{#snippet icon(theme: Theme)}
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if theme === 'light'}
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    {:else if theme === 'dark'}
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    {:else}
      <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    {/if}
  </svg>
{/snippet}

<span class="thememenu" role="presentation" onkeydown={(e) => { if (e.key === 'Escape') open = false }}>
  <button class="themebtn" aria-label={`${messages.theme}: ${options.find((o) => o.value === app.device.theme)?.label}`} aria-haspopup="true" aria-expanded={open} onclick={() => (open = !open)} data-no-silent data-testid="theme-menu">
    {@render icon(app.device.theme)}
  </button>
  {#if open}
    <span class="themelist" role="group" aria-label={messages.theme}>
      {#each options as o (o.value)}
        <button aria-pressed={app.device.theme === o.value} onclick={() => pick(o.value)} data-no-silent data-testid={'theme-' + o.value}>{@render icon(o.value)}<span>{o.label}</span></button>
      {/each}
    </span>
  {/if}
</span>
