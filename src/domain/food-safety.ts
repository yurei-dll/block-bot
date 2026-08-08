const AUTOMATIC_FOOD_EXCLUSIONS = new Set([
  'cake',
  'chicken',
  'chorus_fruit',
  'enchanted_golden_apple',
  'golden_apple',
  'poisonous_potato',
  'pufferfish',
  'rotten_flesh',
  'spider_eye',
  'suspicious_stew',
])

export function isSafeAutomaticFood(itemName: string): boolean {
  return !AUTOMATIC_FOOD_EXCLUSIONS.has(itemName)
}
