<script lang="ts">
  import { installer } from '../installPrompt.svelte'
  import { messages } from '../messages'
</script>

{#if installer.ui === 'button'}
  <button class="secondary" onclick={() => installer.install()} data-testid="install-app">{messages.installApp}</button>
{:else if installer.ui === 'ios-hint'}
  <p class="muted" data-testid="install-ios">{messages.installIosHint}</p>
{/if}
