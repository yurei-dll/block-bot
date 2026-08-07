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
    })
  })

  it('rejects invalid ports', () => {
    expect(() => loadConfig({ MC_PORT: '70000' })).toThrow(/MC_PORT/)
  })
})
