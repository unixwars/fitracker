<script lang="ts">
  import { categoryIcon, ICON_PATHS } from '../categoryIcon'
  let { name, custom }: { name: string; custom?: string } = $props()
</script>

{#if custom}<span class="ci ci-custom" data-testid="category-icon" aria-hidden="true">{custom}</span>{:else}<svg class="ci" data-testid="category-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d={ICON_PATHS[categoryIcon(name)]} /></svg>{/if}
