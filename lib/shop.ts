export type ShopItemCategory = 'invite' | 'flight_stipend'

export const SHOP_ITEM_IDS = {
  STASIS_EVENT_INVITE: 'stasis-event-invite',
  FLIGHT_STIPEND: 'flight-stipend',
} as const

export type ShopItemId = (typeof SHOP_ITEM_IDS)[keyof typeof SHOP_ITEM_IDS]

export interface ShopItem {
  id: ShopItemId
  name: string
  description: string
  bitsCost: number
  category: ShopItemCategory
  maxPerUser: number // 0 = unlimited
}


export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: SHOP_ITEM_IDS.STASIS_EVENT_INVITE,
    name: 'Stasis Event Invite',
    description: 'Your ticket to Stasis!',
    bitsCost: 350,
    category: 'invite',
    maxPerUser: 1,
  },
  {
    id: SHOP_ITEM_IDS.FLIGHT_STIPEND,
    name: 'Flight Stipend',
    description: 'Put bits toward your flight to Stasis. Each purchase adds $10 to your flight stipend.',
    bitsCost: 10,
    category: 'flight_stipend',
    maxPerUser: 0,
  },
] as const
