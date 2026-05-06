// Vendor Price Lookup - sourced from Validation sheet
// Key = lowercase pattern, Value = vendor cost PER UNIT (single piece)

export const DEFAULT_VENDOR_PRICES = {
  "name necklace": 115,
  "double name necklace": 150,
  "bar necklace": 120,
  "reversible tag necklace": 180,
  "personalised cuff bracelet": 72,
  "cuff bracelet": 72,
  "tree of life necklace": 200,
  "cross name necklace": 95,
  "fimo beads": 180,
  "name bracelet": 220,
  "indic name necklace": 95,
  "flower name necklace": 115,
  "hindi name necklace": 95,
  "punjabi name necklace": 95,
  "arabic name necklace": 115,
  "signature couple heart": 160,
  "11:11 necklace": 80,  
  "butterfly necklace": 150,
  "dainty evil eye": 32,
  "diamond studded initial": 375,
  "double heart necklace": 30,
  "emerald stone necklace": 218,
  "evil eye necklace": 32,
  "lock pendant": 115,
  "golden heart necklace": 18,
  "golden teddy necklace": 512,
  "heart & stone": 230,
  "heart stone necklace": 230,
  "initial necklace": 20,
  "linked circle": 167,
  "lock and key": 260,
  "moon necklace": 167,
  "pearl teddy": 218,
  "saturn necklace": 32,
  "star pendant": 167,
  "statement rose": 218,
  "sweetheart necklace": 197,
  "yin and yang": 27,
  "name ring": 180,
  "paw name ring": 180,
  "heart name ring": 180,
  "butterfly name ring": 180,
  "couple name ring": 180,
  "butterfly heart couple": 160,
  "couple name necklace": 160,
  "5 in 1 gift box": 600,
  "lucky clover necklace": 80,
  "minimal rose necklace": 100,
  "snake anklet": 35,
  "minimal snake anklet": 14,
  "round snake anklet": 20,
  "eternal heart necklace": 120,
  "eternal love heart": 120,
  "perfume": 390,
  "floral elegance anklet": 175,
  "hug necklace": 120,
  "radiant mangalsutra": 150,
  "enchanted heartbeat anklet": 225,
  "everlasting prism anklet": 225,
  "eternal bond mangalsutra": 150,
  "majestic aura mangalsutra": 105,
  "luxe noir mangalsutra": 130,
  "elegant mangalsutra": 130,
  "emerald heart necklace": 130,
  "fairy wings set": 205,
  "luxe cylinder pendant": 180,
  "butterfly name necklace": 150,
  "enchante": 160,
  "fairy wings mangalsutra": 170,
  "forever love bracelet": 30,
  "obsidian sparkle": 155,
  "floral mangalsutra": 155,
  "butterfly anklet": 31,
  "premium gift box": 22,
  "personalised car keychain": 75,
  "personalised bike keychain": 75,
  "retro keychain": 95,
  "bowfinity bracelet": 104,
  "leafora bracelet": 104,
  "swan love bracelet": 104,
  "butterfly bracelet": 31,
  "cute pearly bracelet": 15,
  "interlinked diamond bracelet": 130,
  "diamond tennis bracelet": 193,
  "cupid heart bracelet": 104,
  "elegant bracelet": 105,
  "dual heart bracelet": 105,
  "daisy bracelet": 35,
  "daisy anklet": 35,
  "twinkling watch": 112,
  "morse code jewellery": 47,
  "morse code anklet": 47,
  "kashmiri bangles": 230,
  "queen name necklace": 115,
  "angel name necklace": 150,
  "fairy name necklace": 150,
  "serenade necklace": 200,
  "halo necklace": 120,
  "opearl necklace": 182,
  "forge bracelet": 150,
  "blooming grace": 305,
  "ananta": 350,
  "jar of emotions": 30,
  "diy butterfly hamper": 177,
  "clover anklet": 25,
  "minimal bead anklet": 30,
  "paper clip anklet": 18,
  "pyrite anklet": 95,
  "karungali mala": 85,
  "money magnet bracelet": 85,
  "everlasting guardian bell": 35,
  "myra mangalsutra": 70,
  "name necklace with personalised photo": 150,
  "mangalsutra name necklace": 95,
  "initial evil eye kada": 215,
}

// C2P partial payment amount
export const C2P_AMOUNT = 150;

// COD delivery rate assumption for expected profit
export const COD_DELIVERY_RATE = 0.5;

// Fixed costs per shipment (1 shipment = 1 order, regardless of items)
export const LOGISTICS_COSTS = {
  box: 34.3,
  warrantyCard: 1.3,
  freeRing: 12.6,   // only for orders containing a necklace
  packingBag: 3.304,
  shipping: 65,
}

// Fee rates applied on prepaid revenue (including C2P upfront)
export const FEE_RATES = {
  cashfree: 0.0134,
  engage: 0.00134,
  checkout: 0.0077,
}

/**
 * Find vendor price for a product. Matches longest key contained in title.
 */
export function findVendorPrice(title, customPrices = {}) {
  const name = title.toLowerCase()
  const all = { ...DEFAULT_VENDOR_PRICES, ...customPrices }
  let best = null, bestLen = 0
  for (const [key, price] of Object.entries(all)) {
    if (name.includes(key) && key.length > bestLen) {
      best = { key, price }
      bestLen = key.length
    }
  }
  return best ? best.price : 0
}

/**
 * Detect buy multiplier: "Buy 2 @ 1899" -> 2, "Buy 3 @ 2199" -> 3
 */
export function detectBuyMultiplier(title, variant) {
  const text = `${title} ${variant || ''}`.toLowerCase()
  const m = text.match(/buy\s*(\d+)/i)
  return m ? parseInt(m[1]) : 1
}

/**
 * Detect pack multiplier for anklets: "Pack of 2 (Both Leg)" -> 2
 * This means vendor cost is base * 2 (2 physical pieces)
 */
export function detectPackMultiplier(title, variant) {
  const text = `${title} ${variant || ''}`.toLowerCase()
  if (text.includes('pack of 2') || text.includes('both leg')) return 2
  // "Set of 28 bangles" or "Set of 14 bangles"
  const setMatch = text.match(/set of (\d+)/i)
  if (setMatch) return 1 // vendor price already accounts for the set
  return 1
}
