import type { PriorityPolicy, PriorityPolicyInput, TaskScores } from './priority-policy.js'

/**
 * A deliberately small baseline policy. A learned policy can implement the same
 * interface and replace this class without changing tasks or the controller.
 */
export class StarterPolicy implements PriorityPolicy {
  public score({ snapshot, candidates }: PriorityPolicyInput): TaskScores {
    const scores = new Map<string, number>()

    for (const task of candidates) {
      switch (task.id) {
        case 'eat':
          scores.set(task.id, 100 - snapshot.food * 4)
          break
        case 'idle':
          scores.set(task.id, 0)
          break
        default:
          scores.set(task.id, Number.NEGATIVE_INFINITY)
      }
    }

    return scores
  }
}
