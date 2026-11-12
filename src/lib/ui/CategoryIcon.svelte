<script lang="ts">
  import { categoryIcon, ICON_PATHS } from '../categoryIcon'
  let { name }: { name: string } = $props()
</script>

<svg class="ci" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d={ICON_PATHS[categoryIcon(name)]} /></svg>
