import type { Bot } from 'mineflayer'
import { describe, expect, it, vi } from 'vitest'
import { LocationCommands } from '../src/locations/location-commands.js'
import type { LocationRegistry } from '../src/locations/location-registry.js'
import type { SignLocationScanner } from '../src/locations/sign-location-scanner.js'

function dependencies(): {
  chat: ReturnType<typeof vi.fn>
  registry: LocationRegistry
  scanner: SignLocationScanner
} {
  const chat = vi.fn()
  const registry = {
    list: () => [],
    upsertProposal: vi.fn(),
    setApproval: vi.fn(),
  } as unknown as LocationRegistry
  const scanner = { scan: vi.fn() } as unknown as SignLocationScanner
  return { chat, registry, scanner }
}

describe('LocationCommands', () => {
  it('ignores commands from anyone except the configured operator', async () => {
    const { chat, registry, scanner } = dependencies()
    const commands = new LocationCommands(
      { chat } as unknown as Bot,
      registry,
      scanner,
      { operatorUsername: 'Blake', prefix: '!bb' },
    )

    expect(await commands.handle('SomeoneElse', '!bb locations')).toBe(false)
    expect(chat).not.toHaveBeenCalled()
  })

  it('lists no locations for the configured operator', async () => {
    const { chat, registry, scanner } = dependencies()
    const commands = new LocationCommands(
      { chat } as unknown as Bot,
      registry,
      scanner,
      { operatorUsername: 'Blake', prefix: '!bb' },
    )

    expect(await commands.handle('blake', '!bb locations')).toBe(true)
    expect(chat).toHaveBeenCalledWith('No Block Bot locations are registered.')
  })
})
