import { describe, expect, it } from 'vitest'
import { rankTasks } from '../src/policy/priority-policy.js'
import { StarterPolicy } from '../src/policy/starter-policy.js'
import type { WorldSnapshot } from '../src/domain/world-snapshot.js'
import type { BotTask } from '../src/tasks/task.js'

const tasks = [
  { id: 'idle', canRun: () => true, run: async () => ({ status: 'succeeded' as const }) },
  { id: 'eat', canRun: () => true, run: async () => ({ status: 'succeeded' as const }) },
] satisfies BotTask[]

function snapshot(food: number): WorldSnapshot {
  return {
    observedAt: 0,
    health: 20,
    food,
    foodSaturation: 5,
    position: { x: 0, y: 64, z: 0 },
    timeOfDay: 6_000,
    isDay: true,
    inventory: [{ name: 'bread', count: 1, foodPoints: 5 }],
  }
}

describe('StarterPolicy', () => {
  it('prioritizes eating when hunger is sufficiently low', () => {
    const world = snapshot(10)
    const scores = new StarterPolicy().score({ snapshot: world, candidates: tasks })
    expect(rankTasks(tasks, scores)[0]?.task.id).toBe('eat')
  })

  it('uses stable task IDs to break equal-score ties', () => {
    const scores = new Map([
      ['idle', 1],
      ['eat', 1],
    ])
    expect(rankTasks(tasks, scores).map(({ task }) => task.id)).toEqual(['eat', 'idle'])
  })
})
