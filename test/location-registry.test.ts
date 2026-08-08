import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocationRegistry } from '../src/locations/location-registry.js'
import type { LocationProposal } from '../src/locations/location-types.js'

const temporaryDirectories: string[] = []

async function createRegistry(): Promise<{ registry: LocationRegistry; filePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'block-bot-locations-'))
  temporaryDirectories.push(directory)
  const filePath = join(directory, 'locations.v1.json')
  return { registry: new LocationRegistry(filePath), filePath }
}

function proposal(overrides: Partial<LocationProposal> = {}): LocationProposal {
  return {
    id: 'home-pantry',
    serverId: 'test-server',
    dimension: 'overworld',
    position: { x: 10, y: 64, z: 20 },
    blockName: 'minecraft:chest',
    roles: ['storage', 'pickup'],
    categories: ['food'],
    source: { kind: 'sign', position: { x: 10, y: 65, z: 20 }, side: 'front' },
    ...overrides,
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('LocationRegistry', () => {
  it('persists proposals and explicit approval', async () => {
    const { registry, filePath } = await createRegistry()
    expect((await registry.upsertProposal(proposal())).status).toBe('created')
    expect(registry.findApproved('pickup', 'food')).toHaveLength(0)

    expect(await registry.setApproval('home-pantry', 'approved')).toBe(true)
    expect(registry.findApproved('pickup', 'food')).toHaveLength(1)

    const reloaded = new LocationRegistry(filePath)
    await reloaded.load()
    expect(reloaded.list()[0]).toMatchObject({
      id: 'home-pantry',
      approval: 'approved',
      status: 'verified',
    })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ schemaVersion: 1 })
  })

  it('refuses to silently move an existing ID', async () => {
    const { registry } = await createRegistry()
    await registry.upsertProposal(proposal())
    await registry.setApproval('home-pantry', 'approved')

    const result = await registry.upsertProposal(
      proposal({ position: { x: 100, y: 64, z: 100 } }),
    )
    expect(result).toEqual({
      status: 'conflict',
      message: 'ID home-pantry already refers to another block',
    })
    expect(registry.list()[0]?.position).toEqual({ x: 10, y: 64, z: 20 })
  })

  it('requires reapproval when a sign expands an approved designation', async () => {
    const { registry } = await createRegistry()
    await registry.upsertProposal(proposal())
    await registry.setApproval('home-pantry', 'approved')

    const result = await registry.upsertProposal(
      proposal({ roles: ['storage', 'pickup', 'dropoff'] }),
    )
    expect(result.status).toBe('updated')
    expect(registry.list()[0]?.approval).toBe('proposed')
  })

  it('preserves approval when only role and category ordering changes', async () => {
    const { registry } = await createRegistry()
    await registry.upsertProposal(proposal({ categories: ['food', 'farming'] }))
    await registry.setApproval('home-pantry', 'approved')

    await registry.upsertProposal(
      proposal({ roles: ['pickup', 'storage'], categories: ['farming', 'food'] }),
    )
    expect(registry.list()[0]?.approval).toBe('approved')
  })

  it('fails closed on an unsupported state schema', async () => {
    const { registry, filePath } = await createRegistry()
    await writeFile(filePath, JSON.stringify({ schemaVersion: 99, locations: [] }))
    await expect(registry.load()).rejects.toThrow(/Unsupported location state schema/)
    expect(registry.list()).toEqual([])
  })
})
