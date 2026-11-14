<script lang="ts">
  import Alert from './Alert.svelte'
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'

  let { app }: { app: AppState } = $props()
</script>

<section class="card" data-testid="first-run">
  <h2 style="margin: 4px 0 8px">{messages.firstRunTitle}</h2>
  <p>{messages.firstRunBody}</p>
  {#if app.templateCopyUrl}
    <button class="primary" onclick={() => app.createFromTemplate()} data-testid="create-from-template">{messages.createFromTemplate}</button>
  {/if}
  <button class="secondary" style="margin-top: 8px" onclick={() => app.link()} data-testid="link-existing">{messages.linkExisting}</button>
  {#if app.signedIn && app.accountEmail}<p class="muted" data-testid="account">{messages.signedInAs(app.accountEmail)}</p>{/if}
  {#if app.message}<Alert>{app.message}</Alert>{/if}
</section>
