import type { Bot } from 'mineflayer'
import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import { describe, expect, it } from 'vitest'
import { SignLocationScanner } from '../src/locations/sign-location-scanner.js'

function block(name: string, position: Vec3, signText?: [string, string?]): Block {
  return {
    name,
    position,
    getSignText: () => signText ?? ['', undefined],
  } as Block
}

describe('SignLocationScanner', () => {
  it('proposes a uniquely adjacent labeled container', () => {
    const signPosition = new Vec3(10, 65, 20)
    const blocks = new Map<string, Block>([
      [
        signPosition.toString(),
        block('oak_sign', signPosition, ['[block-bot]\nhome-pantry\nstorage,pickup\nfood']),
      ],
      [new Vec3(10, 64, 20).toString(), block('chest', new Vec3(10, 64, 20))],
    ])
    const bot = {
      game: { dimension: 'overworld' },
      findBlocks: () => [signPosition],
      blockAt: (position: Vec3) => blocks.get(position.toString()) ?? null,
    } as unknown as Bot

    const report = new SignLocationScanner(bot, {
      serverId: 'test-server',
      radius: 16,
      limit: 128,
    }).scan()

    expect(report.issues).toEqual([])
    expect(report.proposals).toEqual([
      {
        id: 'home-pantry',
        serverId: 'test-server',
        dimension: 'overworld',
        position: { x: 10, y: 64, z: 20 },
        blockName: 'minecraft:chest',
        roles: ['storage', 'pickup'],
        categories: ['food'],
        source: {
          kind: 'sign',
          position: { x: 10, y: 65, z: 20 },
          side: 'front',
        },
      },
    ])
  })

  it('rejects a label adjacent to multiple containers', () => {
    const signPosition = new Vec3(0, 64, 0)
    const sign = block('oak_wall_sign', signPosition, ['[block-bot]\nambiguous\nstorage\nfood'])
    const bot = {
      game: { dimension: 'overworld' },
      findBlocks: () => [signPosition],
      blockAt: (position: Vec3) => {
        if (position.equals(signPosition)) return sign
        if (position.equals(new Vec3(1, 64, 0))) return block('chest', position)
        if (position.equals(new Vec3(-1, 64, 0))) return block('barrel', position)
        return null
      },
    } as unknown as Bot

    const report = new SignLocationScanner(bot, {
      serverId: 'test-server',
      radius: 16,
      limit: 128,
    }).scan()
    expect(report.proposals).toEqual([])
    expect(report.issues[0]?.message).toMatch(/multiple/)
  })
})
