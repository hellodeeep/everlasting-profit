// Vendor Price Lookup - sourced from Validation sheet
// Key = lowercase product name pattern, Value = vendor cost per unit

export const DEFAULT_VENDOR_PRICES = {
  "name necklace": 115,
  "double name necklace": 150,
  "bar necklace": 120,
  "reversible tag necklace": 180,
  "cuff bracelet": 72,
  "personalised cuff bracelet": 72,
  "tree of life necklace": 200,
  "cross name necklace": 95,
  "fimo beads name necklace": 180,
  "name bracelet": 220,
  "indic name necklace": 95,
  "flower name necklace": 115,
  "hindi name necklace": 95,
  "punjabi name necklace": 95,
  "arabic name necklace": 115,
  "signature couple heart": 160,
  "11:11 necklace": 80,
  "butterfly necklace": 150,
  "dainty evil eye necklace": 32,
  "diamond studded initial": 375,
  "double heart necklace": 30,
  "emerald stone necklace": 218,
  "evil eye necklace": 32,
  "lock pendant necklace": 115,
  "golden heart necklace": 18,
  "golden teddy necklace": 512,
  "heart & stone necklace": 230,
  "initial necklace": 20,
  "linked circle necklace": 167,
  "lock and key necklace": 260,
  "moon necklace": 167,
  "pearl teddy necklace": 218,
  "saturn necklace": 32,
  "star pendant necklace": 167,
  "statement rose necklace": 218,
  "sweetheart necklace": 197,
  "yin and yang necklace": 27,
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
  "perfume": 390,
  "floral elegance anklet": 175,
  "hug necklace": 120,
  "mangalsutra": 150,
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
  "heart stone necklace": 230,
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
  "cupid heart bracelet": 104,
  "elegant bracelet": 105,
  "daisy bracelet": 35,
  "daisy anklet": 35,
  "twinkling watch": 112,
  "morse code": 47,
  "morse code bracelet": 39,
  "kashmiri bangles": 230,
  "queen name necklace": 115,
  "angel name necklace": 150,
  "fairy name necklace": 150,
  "serenade necklace": 200,
  "halo necklace": 120,
  "opearl necklace": 182,
  "forge bracelet": 150,
  "dual heart bracelet": 105,
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
  "diamond tennis bracelet": 193,
  "everlasting guardian bell": 35,
  "myra mangalsutra": 70,
  "morse code anklet": 47,
  "name necklace with personalised photo": 150,
  "mangalsutra name necklace": 95,
}

// Fixed costs per shipment
export const LOGISTICS_COSTS = {
  box: 34.3,           // avg box cost
  warrantyCard: 1.3,   // small card
  freeRing: 12.6,      // free ring per necklace order
  packingBag: 3.304,   // packing bag per order
  shipping: 65,        // avg shipping per order
}

// Fee percentages
export const FEE_RATES = {
  cashfree: 0.0134,    // ~1.34% of prepaid revenue
  engage: 0.00134,     // Engage fee
  checkout: 0.0077,    // Checkout fee (Fastrr)
}

/**
 * Find vendor price for a product name
 * Matches by finding the longest matching key in the product name
 */
export function findVendorPrice(productName, customPrices = {}) {
  const name = productName.toLowerCase()
  const allPrices = { ...DEFAULT_VENDOR_PRICES, ...customPrices }

  // Try exact-ish match first (longest key that's contained in the name)
  let bestMatch = null
  let bestLen = 0

  for (const [key, price] of Object.entries(allPrices)) {
    if (name.includes(key) && key.length > bestLen) {
      bestMatch = { key, price }
      bestLen = key.length
    }
  }

  return bestMatch ? bestMatch.price : 0
}

/**
 * Detect quantity multiplier from variant string
 * "Buy 2 @ 1899" -> 2, "Buy 3 @ 2199" -> 3, "Pack of 2" -> 2
 */
export function detectMultiplier(productName, variantTitle) {
  const combined = `${productName} ${variantTitle || ''}`.toLowerCase()

  // Check for "Buy X" pattern
  const buyMatch = combined.match(/buy\s*(\d+)/i)
  if (buyMatch) return parseInt(buyMatch[1])

  // Check for "Pack of X" for anklets (means X legs, still 1 product unit for cost)
  // Pack of 2 (Both Leg) = 1 unit with higher vendor cost already baked in
  // Pack of 1 (Single Leg) = 1 unit
  // These are already reflected in vendor price lookup

  return 1
}

/**
 * Detect if product is a "pack" variant where vendor price is already for the pack
 * e.g., Snake Anklet Pack of 2 = vendor price 70 (not 35×2)
 */
export function isPackProduct(productName) {
  const name = productName.toLowerCase()
  return name.includes('pack of 2') || name.includes('both leg')
}
