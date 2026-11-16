// One icon picker is open at a time: opening another closes the first.
export const iconPicker = $state<{ open: string }>({ open: '' })
