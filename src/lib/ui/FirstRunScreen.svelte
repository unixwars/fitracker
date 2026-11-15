<script lang="ts">
  import Alert from './Alert.svelte'
  import InstallHelp from './InstallHelp.svelte'
  import type { AppState } from '../app.svelte'
  import { messages } from '../messages'
  import { PROJECT_URL, RELEASES_URL } from '../projectLinks'
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
  {#if app.templateCopyUrl}
    <button class="primary" onclick={() => app.createFromTemplate()} data-testid="create-from-template">{messages.createFromTemplate}</button>
  {/if}
  <button class="secondary" style="margin-top: 8px" onclick={() => app.link()} data-testid="link-existing">{messages.linkExisting}</button>
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
    <a href={PROJECT_URL} target="_blank" rel="noopener" data-testid="project-link">{messages.projectOnGitHub}</a>
    <a href={RELEASES_URL} target="_blank" rel="noopener">{messages.releasesLinkShort}</a>
  </div>
</section>
