<script lang="ts">
  import Alert from './Alert.svelte'
  import InstallHelp from './InstallHelp.svelte'
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'
  import { APP_SHORT_VERSION } from '../buildInfo'
  import { PROJECT_URL } from '../projectLinks'
  import { showIntro } from '../welcome'

  let { app }: { app: AppState } = $props()
  const intro = $derived(showIntro(app.status, app.signedIn))
</script>

<section class="card" data-testid="first-run">
  {#if intro}
    <img class="hero" src={import.meta.env.BASE_URL + 'hero.webp'} alt={messages.heroAlt} width="1086" height="543" decoding="async" data-testid="hero" />
    <h2 style="margin: 4px 0 8px">{messages.introTitle}</h2>
    <div class="intro-tiles">{#each messages.introTiles as t (t)}<span>{t}</span>{/each}</div>
    <p>{messages.introOwnership}</p>
  {:else}
    <h2 style="margin: 4px 0 8px">{messages.firstRunTitle}</h2>
    <p>{messages.firstRunBody}</p>
  {/if}
  <div class="choices">
    {#if app.templateCopyUrl}
      <button class="primary choice" onclick={() => app.createFromTemplate()} data-testid="create-from-template">{messages.createFromTemplate}</button>
      <p class="or" data-testid="or">{messages.or}</p>
    {/if}
    <button class="secondary choice" onclick={() => app.link()} data-testid="link-existing">{messages.linkExisting}</button>
  </div>
  {#if app.signedIn && app.accountEmail}<p class="muted" data-testid="account">{messages.signedInAs(app.accountEmail)}</p>{/if}
  {#if app.message}<Alert>{app.message}</Alert>{/if}
  {#if intro}
    <details class="fold" data-testid="how-it-works">
      <summary>{messages.howItWorks}</summary>
      <ol>{#each messages.howSteps as step (step)}<li>{step}</li>{/each}</ol>
      <InstallHelp />
    </details>
  {/if}
  <details class="fold" open={app.pickerHelp} data-testid="trouble-linking">
    <summary>{messages.troubleLinking}</summary>
    <p class="muted">{messages.troubleLead}</p>
    <ul class="muted">{#each messages.troubleBrowsers as b (b)}<li>{b}</li>{/each}</ul>
  </details>
  <div class="links">
    <a class="linkpill compact" href={PROJECT_URL} target="_blank" rel="noopener" data-testid="project-link">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
      {messages.projectLinkLabel(APP_SHORT_VERSION)}
    </a>
  </div>
</section>
