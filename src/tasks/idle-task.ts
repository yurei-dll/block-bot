import { abortableDelay } from './abort.js'
import type { BotTask, TaskContext, TaskResult } from './task.js'

export class IdleTask implements BotTask {
  public readonly id = 'idle'

  public canRun(): boolean {
    return true
  }

  public async run({ signal }: TaskContext): Promise<TaskResult> {
    try {
      await abortableDelay(1_000, signal)
      return { status: 'succeeded' }
    } catch {
      return { status: 'cancelled' }
    }
  }
}
