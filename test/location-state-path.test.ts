import { describe, expect, it } from 'vitest'
import { locationStateFileName } from '../src/locations/location-state-path.js'

describe('locationStateFileName', () => {
  it('is stable and does not expose the server ID in the filename', () => {
    const fileName = locationStateFileName('private.example.test:25565')
    expect(fileName).toMatch(/^locations\.[a-f0-9]{16}\.v1\.json$/)
    expect(fileName).not.toContain('private.example.test')
    expect(locationStateFileName('private.example.test:25565')).toBe(fileName)
  })

  it('separates different server identities', () => {
    expect(locationStateFileName('server-a')).not.toBe(locationStateFileName('server-b'))
  })
})
