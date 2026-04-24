export type IconSet = {
  prefix: string
  label: string
  description: string
}

export const ICON_SETS: IconSet[] = [
  { prefix: 'ph', label: 'Phosphor', description: 'Clean, comprehensive' },
  { prefix: 'solar', label: 'Solar', description: 'Bold, duotone' },
  { prefix: 'tabler', label: 'Tabler', description: 'Consistent outline' },
  { prefix: 'game-icons', label: 'Game Icons', description: 'Distinctive marks' },
]

export const ICON_SET_PREFIXES = ICON_SETS.map((s) => s.prefix)
