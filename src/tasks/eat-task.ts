import type { Item } from 'prismarine-item'
import { isSafeAutomaticFood } from '../domain/food-safety.js'
import type { BotTask, TaskContext, TaskResult } from './task.js'
import type { WorldSnapshot } from '../domain/world-snapshot.js'

function findBestFood(context: TaskContext): Item | undefined {
  const { bot } = context
  return bot.inventory
    .items()
    .filter(
      (item) =>
        bot.registry.foodsByName[item.name] !== undefined && isSafeAutomaticFood(item.name),
    )
    .sort((left, right) => {
      const leftPoints = bot.registry.foodsByName[left.name]?.foodPoints ?? 0
      const rightPoints = bot.registry.foodsByName[right.name]?.foodPoints ?? 0
      return rightPoints - leftPoints
    })[0]
}

export class EatTask implements BotTask {
  public readonly id = 'eat'

  public canRun(snapshot: WorldSnapshot): boolean {
    return (
      snapshot.food < 20 &&
      snapshot.inventory.some(
        (item) =>
          item.count > 0 &&
          item.foodPoints !== undefined &&
          isSafeAutomaticFood(item.name),
      )
    )
  }

  public async run(context: TaskContext): Promise<TaskResult> {
    const food = findBestFood(context)
    if (!food) return { status: 'failed', detail: 'No edible item is available' }
    if (context.signal.aborted) return { status: 'cancelled' }

    try {
      await context.bot.equip(food, 'hand')
      if (context.signal.aborted) return { status: 'cancelled' }
      await context.bot.consume()
      return { status: 'succeeded', detail: `Ate ${food.name}` }
    } catch (error) {
      if (context.signal.aborted) return { status: 'cancelled' }
      const detail = error instanceof Error ? error.message : String(error)
      return { status: 'failed', detail }
    }
  }
}
