import type { Bot } from 'mineflayer'
import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import { describe, expect, it, vi } from 'vitest'
import type { WorldSnapshot } from '../src/domain/world-snapshot.js'
import type { LocationDesignation } from '../src/locations/location-types.js'
import type { Navigator } from '../src/navigation/navigator.js'
import {
  RetrieveFoodTask,
  selectNearestFoodLocation,
  type FoodLocationRegistry,
} from '../src/tasks/retrieve-food-task.js'

function location(
  id: string,
  position: LocationDesignation['position'],
  dimension = 'overworld',
): LocationDesignation {
  return {
    id,
    serverId: 'test-server',
    dimension,
    position,
    blockName: 'minecraft:chest',
    roles: ['storage', 'pickup'],
    categories: ['food'],
    source: { kind: 'sign', position: { x: position.x, y: position.y + 1, z: position.z }, side: 'front' },
    approval: 'approved',
    status: 'verified',
    discoveredAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    lastVerifiedAt: '2026-08-08T00:00:00.000Z',
  }
}

function snapshot(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    observedAt: 0,
    dimension: 'overworld',
    health: 20,
    food: 12,
    foodSaturation: 2,
    position: { x: 0, y: 64, z: 0 },
    timeOfDay: 6_000,
    isDay: true,
    inventory: [],
    ...overrides,
  }
}

function registry(locations: readonly LocationDesignation[]): FoodLocationRegistry {
  let current = [...locations]
  return {
    findApproved: (role, category) =>
      current.filter(
        (location) =>
          location.approval === 'approved' &&
          location.status === 'verified' &&
          (role === undefined || location.roles.includes(role)) &&
          (category === undefined || location.categories.includes(category)),
      ),
    setStatus: vi.fn(async (id: string, status: LocationDesignation['status']) => {
      const existing = current.find((location) => location.id === id)
      if (!existing) return false
      current = current.map((location) =>
        location.id === id ? { ...location, status } : location,
      )
      return true
    }),
  }
}

function navigator(): Navigator {
  return { goNear: vi.fn().mockResolvedValue(undefined) }
}

describe('RetrieveFoodTask', () => {
  it('selects the nearest approved food pickup in the current dimension', () => {
    const locations = registry([
      location('far', { x: 100, y: 64, z: 100 }),
      location('nether', { x: 1, y: 64, z: 1 }, 'the_nether'),
      location('near', { x: 5, y: 64, z: 5 }),
    ])
    expect(selectNearestFoodLocation(locations, snapshot())?.id).toBe('near')
  })

  it('is unavailable while the bot already carries food', () => {
    const task = new RetrieveFoodTask(
      registry([location('pantry', { x: 5, y: 64, z: 5 })]),
      navigator(),
      { maximumItems: 4, retryCooldownMs: 10_000, goalRange: 2 },
    )
    expect(
      task.canRun(snapshot({ inventory: [{ name: 'bread', count: 1, foodPoints: 5 }] })),
    ).toBe(false)
  })

  it('can retrieve safe food when the bot carries only excluded food', () => {
    const task = new RetrieveFoodTask(
      registry([location('pantry', { x: 5, y: 64, z: 5 })]),
      navigator(),
      { maximumItems: 4, retryCooldownMs: 10_000, goalRange: 2 },
    )
    expect(
      task.canRun(
        snapshot({ inventory: [{ name: 'rotten_flesh', count: 4, foodPoints: 4 }] }),
      ),
    ).toBe(true)
  })

  it('navigates, revalidates, withdraws bounded food, and closes the container', async () => {
    const pantry = location('home-pantry', { x: 5, y: 64, z: 5 })
    const locations = registry([pantry])
    const route = navigator()
    const bread = { name: 'bread', type: 297, metadata: 0, count: 8 } as Item
    const container = {
      containerItems: () => [bread],
      withdraw: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    }
    const bot = {
      registry: {
        foodsByName: {
          bread: { foodPoints: 5, effectiveQuality: 11 },
        },
      },
      blockAt: () => ({ name: 'chest' }) as Block,
      openContainer: vi.fn().mockResolvedValue(container),
    } as unknown as Bot
    const task = new RetrieveFoodTask(locations, route, {
      maximumItems: 4,
      retryCooldownMs: 10_000,
      goalRange: 2,
    })

    const result = await task.run({
      bot,
      snapshot: snapshot(),
      signal: new AbortController().signal,
    })

    expect(route.goNear).toHaveBeenCalledWith(pantry.position, 2, expect.any(AbortSignal))
    expect(container.withdraw).toHaveBeenCalledWith(297, 0, 2)
    expect(container.close).toHaveBeenCalledOnce()
    expect(result).toEqual({
      status: 'succeeded',
      detail: 'Retrieved 2 bread from home-pantry',
    })
  })

  it('marks a missing designated block stale and applies a retry cooldown', async () => {
    let now = 1_000
    const pantry = location('home-pantry', { x: 5, y: 64, z: 5 })
    const locations = registry([pantry])
    const bot = { blockAt: () => null } as unknown as Bot
    const task = new RetrieveFoodTask(locations, navigator(), {
      maximumItems: 4,
      retryCooldownMs: 10_000,
      goalRange: 2,
      now: () => now,
    })

    const result = await task.run({
      bot,
      snapshot: snapshot(),
      signal: new AbortController().signal,
    })
    expect(locations.setStatus).toHaveBeenCalledWith('home-pantry', 'stale')
    expect(result.status).toBe('failed')
    expect(task.canRun(snapshot())).toBe(false)

    now = 11_000
    expect(task.canRun(snapshot())).toBe(false)
  })

  it('tries another pantry while a failed source is cooling down', async () => {
    const near = location('near-pantry', { x: 2, y: 64, z: 2 })
    const far = location('far-pantry', { x: 20, y: 64, z: 20 })
    const route = navigator()
    const unsafeFood = { name: 'rotten_flesh', type: 367, metadata: 0, count: 8 } as Item
    const bread = { name: 'bread', type: 297, metadata: 0, count: 8 } as Item
    const emptyContainer = {
      containerItems: () => [unsafeFood],
      withdraw: vi.fn(),
      close: vi.fn(),
    }
    const stockedContainer = {
      containerItems: () => [bread],
      withdraw: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    }
    const bot = {
      registry: {
        foodsByName: {
          bread: { foodPoints: 5, effectiveQuality: 11 },
          rotten_flesh: { foodPoints: 4, effectiveQuality: 4.8 },
        },
      },
      blockAt: () => ({ name: 'chest' }) as Block,
      openContainer: vi
        .fn()
        .mockResolvedValueOnce(emptyContainer)
        .mockResolvedValueOnce(stockedContainer),
    } as unknown as Bot
    const task = new RetrieveFoodTask(registry([near, far]), route, {
      maximumItems: 4,
      retryCooldownMs: 10_000,
      goalRange: 2,
      now: () => 1_000,
    })
    const context = {
      bot,
      snapshot: snapshot(),
      signal: new AbortController().signal,
    }

    expect((await task.run(context)).status).toBe('failed')
    expect((await task.run(context)).status).toBe('succeeded')
    expect(route.goNear).toHaveBeenNthCalledWith(1, near.position, 2, expect.any(AbortSignal))
    expect(route.goNear).toHaveBeenNthCalledWith(2, far.position, 2, expect.any(AbortSignal))
  })
})
