export type ShopItemCategory = 'invite' | 'flight_stipend' | 'accommodation'

export const SHOP_ITEM_IDS = {
  STASIS_EVENT_INVITE: 'stasis-event-invite',
  OPEN_SAUCE_TICKET: 'open-sauce-ticket',
  FLIGHT_STIPEND: 'flight-stipend',
  PRE_EVENT_ACCOMMODATION: 'pre-event-accommodation',
  POST_EVENT_ACCOMMODATION: 'post-event-accommodation',
} as const

export type ShopItemId = (typeof SHOP_ITEM_IDS)[keyof typeof SHOP_ITEM_IDS]

export interface ShopItem {
  id: ShopItemId
  name: string
  description: string
  disclaimer?: string
  bitsCost: number
  category: ShopItemCategory
  maxPerUser: number // 0 = unlimited
}

/** IDs of all event invite items (purchasing any one unlocks Flight Stipend). */
export const EVENT_INVITE_IDS: readonly ShopItemId[] = [
  SHOP_ITEM_IDS.STASIS_EVENT_INVITE,
  SHOP_ITEM_IDS.OPEN_SAUCE_TICKET,
]

/** IDs of items that require the Stasis Event Invite specifically. */
export const REQUIRES_STASIS_INVITE_IDS: readonly ShopItemId[] = [
  SHOP_ITEM_IDS.PRE_EVENT_ACCOMMODATION,
  SHOP_ITEM_IDS.POST_EVENT_ACCOMMODATION,
]

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: SHOP_ITEM_IDS.STASIS_EVENT_INVITE,
    name: 'Stasis Event Invite',
    description: 'Your ticket to Stasis!',
    disclaimer: 'Does not include travel.',
    bitsCost: 350,
    category: 'invite',
    maxPerUser: 1,
  },
  {
    id: SHOP_ITEM_IDS.OPEN_SAUCE_TICKET,
    name: 'Open Sauce Ticket',
    description: 'Your ticket to Open Sauce with Hack Club!',
    disclaimer: 'Does not include travel or accommodation.',
    bitsCost: 250,
    category: 'invite',
    maxPerUser: 1,
  },
  {
    id: SHOP_ITEM_IDS.FLIGHT_STIPEND,
    name: 'Flight Stipend',
    description: 'Put bits toward your flight. Each purchase adds $10 to your flight stipend.',
    bitsCost: 10,
    category: 'flight_stipend',
    maxPerUser: 0,
  },
  {
    id: SHOP_ITEM_IDS.PRE_EVENT_ACCOMMODATION,
    name: 'Pre-Event Accommodation',
    description: 'Stay the night before Stasis. (For Stasis Only!)',
    bitsCost: 100,
    category: 'accommodation',
    maxPerUser: 1,
  },
  {
    id: SHOP_ITEM_IDS.POST_EVENT_ACCOMMODATION,
    name: 'Post-Event Accommodation',
    description: 'Stay the night after Stasis. (For Stasis Only!)',
    bitsCost: 100,
    category: 'accommodation',
    maxPerUser: 1,
  },
] as const
