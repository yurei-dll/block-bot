import type { Bot } from 'mineflayer'
import type { Item } from 'prismarine-item'
import { Vec3 } from 'vec3'
import { isSafeAutomaticFood } from '../domain/food-safety.js'
import type { WorldSnapshot } from '../domain/world-snapshot.js'
import type { LocationDesignation, LocationStatus } from '../locations/location-types.js'
import { isSupportedStorageBlock } from '../locations/sign-location-scanner.js'
import type { Navigator } from '../navigation/navigator.js'
import type { BotTask, TaskContext, TaskResult } from './task.js'

export interface FoodLocationRegistry {
  findApproved(role?: 'storage' | 'pickup' | 'dropoff', category?: string): readonly LocationDesignation[]
  setStatus(id: string, status: LocationStatus): Promise<boolean>
}

export interface RetrieveFoodTaskOptions {
  readonly maximumItems: number
  readonly retryCooldownMs: number
  readonly goalRange: number
  readonly now?: () => number
}

interface FoodCandidate {
  readonly item: Item
  readonly foodPoints: number
  readonly effectiveQuality: number
}

function distanceSquared(
  left: WorldSnapshot['position'],
  right: LocationDesignation['position'],
): number {
  const x = left.x - right.x
  const y = left.y - right.y
  const z = left.z - right.z
  return x * x + y * y + z * z
}

export function selectNearestFoodLocation(
  registry: FoodLocationRegistry,
  snapshot: WorldSnapshot,
  unavailableIds: ReadonlySet<string> = new Set(),
): LocationDesignation | undefined {
  return registry
    .findApproved('pickup', 'food')
    .filter(
      (location) =>
        location.dimension === snapshot.dimension && !unavailableIds.has(location.id),
    )
    .sort(
      (left, right) =>
        distanceSquared(snapshot.position, left.position) -
          distanceSquared(snapshot.position, right.position) || left.id.localeCompare(right.id),
    )[0]
}

function selectFood(bot: Bot, items: readonly Item[]): FoodCandidate | undefined {
  return items
    .flatMap((item): FoodCandidate[] => {
      const food = bot.registry.foodsByName[item.name]
      if (!food || !isSafeAutomaticFood(item.name)) return []
      return [{ item, foodPoints: food.foodPoints, effectiveQuality: food.effectiveQuality }]
    })
    .sort(
      (left, right) =>
        right.effectiveQuality - left.effectiveQuality ||
        right.foodPoints - left.foodPoints ||
        left.item.name.localeCompare(right.item.name),
    )[0]
}

export class RetrieveFoodTask implements BotTask {
  public readonly id = 'retrieve_food'
  private readonly retryAfterByLocation = new Map<string, number>()
  private readonly now: () => number

  public constructor(
    private readonly locations: FoodLocationRegistry,
    private readonly navigator: Navigator,
    private readonly options: RetrieveFoodTaskOptions,
  ) {
    this.now = options.now ?? Date.now
  }

  public canRun(snapshot: WorldSnapshot): boolean {
    return (
      snapshot.food < 20 &&
      !snapshot.inventory.some(
        (item) =>
          item.count > 0 &&
          item.foodPoints !== undefined &&
          isSafeAutomaticFood(item.name),
      ) &&
      this.selectLocation(snapshot) !== undefined
    )
  }

  public async run(context: TaskContext): Promise<TaskResult> {
    const location = this.selectLocation(context.snapshot)
    if (!location) {
      return { status: 'failed', detail: 'No available food pickup exists in this dimension' }
    }

    let container: Awaited<ReturnType<Bot['openContainer']>> | undefined
    const closeOnAbort = (): void => container?.close()
    context.signal.addEventListener('abort', closeOnAbort, { once: true })
    try {
      await this.navigator.goNear(location.position, this.options.goalRange, context.signal)
      if (context.signal.aborted) return { status: 'cancelled' }

      const block = context.bot.blockAt(
        new Vec3(location.position.x, location.position.y, location.position.z),
        false,
      )
      const expectedName = location.blockName.replace(/^minecraft:/, '')
      if (!block || block.name !== expectedName || !isSupportedStorageBlock(block)) {
        await this.locations.setStatus(location.id, 'stale')
        return this.fail(location.id, `${location.id} no longer contains its designated storage block`)
      }

      container = await context.bot.openContainer(block)
      if (context.signal.aborted) return { status: 'cancelled' }
      const selected = selectFood(context.bot, container.containerItems())
      if (!selected) return this.fail(location.id, `${location.id} contains no supported safe food`)

      const missingFoodPoints = Math.max(1, 20 - context.snapshot.food)
      const desiredCount = Math.max(1, Math.ceil(missingFoodPoints / selected.foodPoints))
      const count = Math.min(selected.item.count, desiredCount, this.options.maximumItems)
      await container.withdraw(selected.item.type, selected.item.metadata, count)
      this.retryAfterByLocation.delete(location.id)
      return {
        status: 'succeeded',
        detail: `Retrieved ${count} ${selected.item.name} from ${location.id}`,
      }
    } catch (error) {
      if (context.signal.aborted) return { status: 'cancelled' }
      const detail = error instanceof Error ? error.message : String(error)
      return this.fail(location.id, `Could not retrieve food from ${location.id}: ${detail}`)
    } finally {
      context.signal.removeEventListener('abort', closeOnAbort)
      container?.close()
    }
  }

  private selectLocation(snapshot: WorldSnapshot): LocationDesignation | undefined {
    const now = this.now()
    for (const [id, retryAfter] of this.retryAfterByLocation) {
      if (now >= retryAfter) this.retryAfterByLocation.delete(id)
    }
    return selectNearestFoodLocation(
      this.locations,
      snapshot,
      new Set(this.retryAfterByLocation.keys()),
    )
  }

  private fail(locationId: string, detail: string): TaskResult {
    this.retryAfterByLocation.set(locationId, this.now() + this.options.retryCooldownMs)
    return { status: 'failed', detail }
  }
}
