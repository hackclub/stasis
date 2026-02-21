export type ShopItemCategory = 'invite' | 'flight_stipend'

export interface ShopItem {
  id: string
  name: string
  description: string
  bitsCost: number
  category: ShopItemCategory
  maxPerUser: number
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: 'stasis-event-invite',
    name: 'Stasis Event Invite',
    description: 'Your ticket to the Stasis hardware event. Requires 350 bits of project profit to qualify.',
    bitsCost: 350,
    category: 'invite',
    maxPerUser: 1,
  },
  {
    id: 'flight-stipend-tier-1',
    name: 'Flight Stipend (Tier 1)',
    description: 'Flight stipend for Tier 1 project builders (~20-40 hours of work).',
    bitsCost: 300,
    category: 'flight_stipend',
    maxPerUser: 1,
  },
  {
    id: 'flight-stipend-tier-2',
    name: 'Flight Stipend (Tier 2)',
    description: 'Flight stipend for Tier 2 project builders (~10-20 hours of work).',
    bitsCost: 150,
    category: 'flight_stipend',
    maxPerUser: 1,
  },
  {
    id: 'flight-stipend-tier-3',
    name: 'Flight Stipend (Tier 3)',
    description: 'Flight stipend for Tier 3 project builders (~5-10 hours of work).',
    bitsCost: 75,
    category: 'flight_stipend',
    maxPerUser: 1,
  },
  {
    id: 'flight-stipend-tier-4',
    name: 'Flight Stipend (Tier 4)',
    description: 'Flight stipend for Tier 4 project builders (~3-5 hours of work).',
    bitsCost: 40,
    category: 'flight_stipend',
    maxPerUser: 1,
  },
] as const
