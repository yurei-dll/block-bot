import type { WorldSnapshot } from '../domain/world-snapshot.js'
import type { BotTask, TaskId } from '../tasks/task.js'

export type TaskScores = ReadonlyMap<TaskId, number>

export interface PriorityPolicyInput {
  readonly snapshot: WorldSnapshot
  readonly candidates: readonly BotTask[]
}

export interface PriorityPolicy {
  score(input: PriorityPolicyInput): TaskScores | Promise<TaskScores>
}

export interface RankedTask {
  readonly task: BotTask
  readonly score: number
}

export function rankTasks(candidates: readonly BotTask[], scores: TaskScores): RankedTask[] {
  return candidates
    .map((task) => ({ task, score: scores.get(task.id) ?? Number.NEGATIVE_INFINITY }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score || left.task.id.localeCompare(right.task.id))
}
