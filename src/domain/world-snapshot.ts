import type { Bot } from 'mineflayer'

export interface InventoryItemSnapshot {
  readonly name: string
  readonly count: number
  readonly foodPoints?: number
}

export interface WorldSnapshot {
  readonly observedAt: number
  readonly dimension: string
  readonly health: number
  readonly food: number
  readonly foodSaturation: number
  readonly position: Readonly<{
    x: number
    y: number
    z: number
  }>
  readonly timeOfDay: number
  readonly isDay: boolean
  readonly inventory: readonly InventoryItemSnapshot[]
  readonly activeTaskId?: string
}

export function observeWorld(bot: Bot, activeTaskId?: string): WorldSnapshot {
  const { x, y, z } = bot.entity.position
  return {
    observedAt: Date.now(),
    dimension: bot.game.dimension,
    health: bot.health,
    food: bot.food,
    foodSaturation: bot.foodSaturation,
    position: { x, y, z },
    timeOfDay: bot.time.timeOfDay,
    isDay: bot.time.isDay,
    inventory: bot.inventory.items().map(({ name, count }) => {
      const foodPoints = bot.registry.foodsByName[name]?.foodPoints
      return { name, count, ...(foodPoints === undefined ? {} : { foodPoints }) }
    }),
    ...(activeTaskId ? { activeTaskId } : {}),
  }
}
