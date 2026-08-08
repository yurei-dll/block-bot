import type { Bot } from 'mineflayer'
import pathfinderPackage from 'mineflayer-pathfinder'
import type { Movements as PathfinderMovements } from 'mineflayer-pathfinder'
import type { BlockPosition } from '../locations/location-types.js'
import type { Navigator } from './navigator.js'

export class PathfinderNavigator implements Navigator {
  private movements: PathfinderMovements | undefined

  public constructor(private readonly bot: Bot) {}

  public async goNear(
    position: BlockPosition,
    range: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw signal.reason

    const stop = (): void => this.bot.pathfinder.stop()
    signal.addEventListener('abort', stop, { once: true })
    try {
      this.bot.pathfinder.setMovements(this.getMovements())
      await this.bot.pathfinder.goto(
        new pathfinderPackage.goals.GoalNear(position.x, position.y, position.z, range),
      )
      if (signal.aborted) throw signal.reason
    } finally {
      signal.removeEventListener('abort', stop)
    }
  }

  private getMovements(): PathfinderMovements {
    if (this.movements) return this.movements
    const movements = new pathfinderPackage.Movements(this.bot)
    movements.canDig = false
    movements.canOpenDoors = false
    movements.allow1by1towers = false
    movements.allowParkour = false
    movements.allowSprinting = false
    movements.scafoldingBlocks = []
    movements.maxDropDown = 2
    this.movements = movements
    return movements
  }
}
