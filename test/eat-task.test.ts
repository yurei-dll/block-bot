import { describe, expect, it } from 'vitest'
import { EatTask } from '../src/tasks/eat-task.js'
import type { WorldSnapshot } from '../src/domain/world-snapshot.js'

function snapshot(inventory: WorldSnapshot['inventory']): WorldSnapshot {
  return {
    observedAt: 0,
    dimension: 'overworld',
    health: 20,
    food: 10,
    foodSaturation: 5,
    position: { x: 0, y: 64, z: 0 },
    timeOfDay: 6_000,
    isDay: true,
    inventory,
  }
}

describe('EatTask', () => {
  it('is available when the bot is hungry and carries food', () => {
    expect(new EatTask().canRun(snapshot([{ name: 'bread', count: 1, foodPoints: 5 }]))).toBe(true)
  })

  it('does not mistake arbitrary inventory for food', () => {
    expect(new EatTask().canRun(snapshot([{ name: 'cobblestone', count: 64 }]))).toBe(false)
  })

  it('does not automatically consume harmful or exceptional food', () => {
    expect(
      new EatTask().canRun(snapshot([{ name: 'rotten_flesh', count: 4, foodPoints: 4 }])),
    ).toBe(false)
  })
})
