import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('provides local development defaults', () => {
    expect(loadConfig({})).toEqual({
      minecraft: {
        host: 'localhost',
        port: 25_565,
        username: 'block-bot',
        auth: 'offline',
      },
      controller: {
        decisionIntervalMs: 500,
        minimumTaskRuntimeMs: 1_000,
        switchMargin: 10,
      },
      locations: {
        commandPrefix: '!bb',
        scanRadius: 16,
        scanLimit: 128,
        stateDirectory: '.block-bot',
        serverId: 'localhost:25565',
      },
      behaviors: {
        retrieveFood: {
          maximumItems: 4,
          retryCooldownMs: 10_000,
          goalRange: 2,
        },
      },
    })
  })

  it('rejects invalid ports', () => {
    expect(() => loadConfig({ MC_PORT: '70000' })).toThrow(/MC_PORT/)
  })

  it('loads optional operator and location settings', () => {
    expect(
      loadConfig({
        BOT_OPERATOR_USERNAME: 'Blake',
        BOT_COMMAND_PREFIX: '!bot',
        BOT_LOCATION_SCAN_RADIUS: '24',
        BOT_SERVER_ID: 'test-world',
        BOT_RETRIEVE_FOOD_MAX_ITEMS: '2',
      }).locations,
    ).toMatchObject({
      operatorUsername: 'Blake',
      commandPrefix: '!bot',
      scanRadius: 24,
      serverId: 'test-world',
    })
    expect(
      loadConfig({ BOT_RETRIEVE_FOOD_MAX_ITEMS: '2' }).behaviors.retrieveFood.maximumItems,
    ).toBe(2)
  })
})
