// Default vendor prices from Validation sheet
export const DEFAULT_VENDOR_PRICES = {
  "name necklace": 115,
  "arabic name necklace": 115,
  "flower name necklace": 115,
  "queen name necklace": 115,
  "bar necklace": 120,
  "11:11 necklace": 100,
  "serenade necklace": 200,
  "halo necklace": 175,
  "lucky clover necklace": 80,
  "morse code jewellery": 47,
  "morse code bracelet": 39,
  "eternal love heart set": 340,
  "butterfly anklet": 31,
  "snake anklet": 35,
  "round snake anklet": 40,
  "daisy anklet": 70,
  "personalised car keychain": 75,
  "premium gift box": 22,
  "premium gift box with gift wrap": 22,
  "kashmiri bangles": 460,
  "personalised cuff bracelet - couple": 144,
  "personalised cuff bracelet - for female": 72,
  "personalised cuff bracelet - for male": 72,
  "butterfly bracelet": 31,
  "daisy bracelet": 35,
  "leafora bracelet": 104,
  "bowfinity bracelet": 104,
  "swan love bracelet": 104,
  "diy butterfly hamper": 177,
  "jar of emotions": 30,
  "ananta": 350,
  "5 in 1 gift box": 600,
}

// Logistics costs
export const LOGISTICS_COSTS = {
  box: 34.3,            // per order (ALL orders, packed regardless)
  warrantyCard: 1.5,    // per order, COD at 70%
  freeRing: 17.51,      // per PREPAID order only
  packingBag: 3.5,      // per order, COD at 70%
  shippingPrepaid: 60,  // per prepaid order
  shippingCOD: 100,     // per COD/C2P order, at 70%
}

// COD dispatch rate (70% of COD/C2P orders actually ship)
export const COD_DISPATCH_RATE = 0.7

// Payment rates
export const C2P_AMOUNT = 150         // upfront collection for PPCOD
export const COD_DELIVERY_RATE = 0.5  // 50% of COD orders deliver successfully

// Fee rates (on Cashfree collection only)
export const FEE_RATES = {
  cashfree: 0.0134,
  engage: 0.00134,
  checkout: 0.0077,
}

// Find vendor price from product title
export function findVendorPrice(title, customPrices = {}) {
  const lower = title.toLowerCase()
  // Check custom prices first
  for (const [key, price] of Object.entries(customPrices)) {
    if (lower.includes(key)) return price
  }
  // Check defaults
  for (const [key, price] of Object.entries(DEFAULT_VENDOR_PRICES)) {
    if (lower.includes(key)) return price
  }
  return 0
}

// Detect buy multiplier from title/variant
export function detectBuyMultiplier(title, variantTitle) {
  const combined = `${title} ${variantTitle || ''}`.toLowerCase()
  const m3 = combined.match(/buy\s*3/i)
  if (m3) return 3
  const m2 = combined.match(/buy\s*2/i)
  if (m2) return 2
  return 1
}

// Detect pack multiplier (e.g., "Pack of 2 Both Leg")
export function detectPackMultiplier(title, variantTitle) {
  const combined = `${title} ${variantTitle || ''}`.toLowerCase()
  if (combined.includes('both leg') || combined.includes('pack of 2')) return 2
  return 1
}
