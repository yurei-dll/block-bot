import type { Bot } from 'mineflayer'
import type { WorldSnapshot } from '../domain/world-snapshot.js'
import type { PriorityPolicy, RankedTask } from '../policy/priority-policy.js'
import { rankTasks } from '../policy/priority-policy.js'
import type { BotTask, TaskResult } from '../tasks/task.js'

export interface TaskControllerOptions {
  readonly decisionIntervalMs: number
  readonly minimumTaskRuntimeMs: number
  readonly switchMargin: number
  readonly observe: (activeTaskId?: string) => WorldSnapshot
  readonly onDecision?: (decision: RankedTask, snapshot: WorldSnapshot) => void
  readonly onTaskResult?: (task: BotTask, result: TaskResult) => void
  readonly onError?: (error: unknown) => void
}

interface ActiveTask {
  readonly task: BotTask
  readonly score: number
  readonly startedAt: number
  readonly abortController: AbortController
  readonly promise: Promise<void>
}

export class TaskController {
  private activeTask: ActiveTask | undefined
  private interval: NodeJS.Timeout | undefined
  private decisionInProgress = false

  public constructor(
    private readonly bot: Bot,
    private readonly tasks: readonly BotTask[],
    private readonly policy: PriorityPolicy,
    private readonly options: TaskControllerOptions,
  ) {
    const taskIds = new Set(tasks.map(({ id }) => id))
    if (taskIds.size !== tasks.length) throw new Error('Task IDs must be unique')
  }

  public start(): void {
    if (this.interval) return
    void this.decide()
    this.interval = setInterval(() => void this.decide(), this.options.decisionIntervalMs)
  }

  public async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval)
    this.interval = undefined
    this.activeTask?.abortController.abort(new Error('Task controller stopped'))
    await this.activeTask?.promise
  }

  private async decide(): Promise<void> {
    if (this.decisionInProgress) return
    this.decisionInProgress = true

    try {
      const snapshot = this.options.observe(this.activeTask?.task.id)
      const candidates = this.tasks.filter((task) => task.canRun(snapshot))
      const ranked = rankTasks(candidates, await this.policy.score({ snapshot, candidates }))
      const next = ranked[0]
      if (!next) return

      this.options.onDecision?.(next, snapshot)
      if (!this.shouldStart(next)) return

      if (this.activeTask) {
        this.activeTask.abortController.abort(new Error(`Preempted by ${next.task.id}`))
        return
      }
      this.startTask(next, snapshot)
    } catch (error) {
      this.options.onError?.(error)
    } finally {
      this.decisionInProgress = false
    }
  }

  private shouldStart(next: RankedTask): boolean {
    const active = this.activeTask
    if (!active) return true
    if (active.task.id === next.task.id) return false

    const runtime = Date.now() - active.startedAt
    return (
      runtime >= this.options.minimumTaskRuntimeMs &&
      next.score >= active.score + this.options.switchMargin
    )
  }

  private startTask(decision: RankedTask, snapshot: WorldSnapshot): void {
    const abortController = new AbortController()
    const active: ActiveTask = {
      task: decision.task,
      score: decision.score,
      startedAt: Date.now(),
      abortController,
      promise: Promise.resolve(),
    }

    const promise = decision.task
      .run({ bot: this.bot, snapshot, signal: abortController.signal })
      .then((result) => this.options.onTaskResult?.(decision.task, result))
      .catch((error: unknown) => this.options.onError?.(error))
      .finally(() => {
        if (this.activeTask === active) this.activeTask = undefined
      })

    Object.assign(active, { promise })
    this.activeTask = active
  }
}
