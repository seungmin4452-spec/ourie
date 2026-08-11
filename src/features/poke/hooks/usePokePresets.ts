import { useQuery } from '@tanstack/react-query'

import { listPokePresets } from '../api/presets'

export function pokePresetsQueryKey(coupleId: string | null | undefined) {
  return ['poke-presets', coupleId] as const
}

export function usePokePresets(coupleId: string | null | undefined) {
  return useQuery({
    queryKey: pokePresetsQueryKey(coupleId),
    queryFn: () => listPokePresets(coupleId!),
    enabled: coupleId != null,
  })
}
