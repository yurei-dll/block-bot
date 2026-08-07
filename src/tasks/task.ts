import type { Bot } from 'mineflayer'
import type { WorldSnapshot } from '../domain/world-snapshot.js'

export type TaskId = string

export type TaskResult =
  | { readonly status: 'succeeded'; readonly detail?: string }
  | { readonly status: 'failed'; readonly detail: string }
  | { readonly status: 'cancelled'; readonly detail?: string }

export interface TaskContext {
  readonly bot: Bot
  readonly snapshot: WorldSnapshot
  readonly signal: AbortSignal
}

export interface BotTask {
  readonly id: TaskId
  canRun(snapshot: WorldSnapshot): boolean
  run(context: TaskContext): Promise<TaskResult>
}
