import type { Bot } from 'mineflayer'
import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import type { BlockPosition, LocationProposal } from './location-types.js'
import { positionKey } from './location-types.js'
import { parseLocationSign } from './sign-label-parser.js'

export interface SignScanIssue {
  readonly signPosition: BlockPosition
  readonly message: string
}

export interface SignScanReport {
  readonly scannedSigns: number
  readonly proposals: readonly LocationProposal[]
  readonly issues: readonly SignScanIssue[]
}

export interface SignLocationScannerOptions {
  readonly serverId: string
  readonly radius: number
  readonly limit: number
}

const ADJACENT_OFFSETS = [
  new Vec3(1, 0, 0),
  new Vec3(-1, 0, 0),
  new Vec3(0, 1, 0),
  new Vec3(0, -1, 0),
  new Vec3(0, 0, 1),
  new Vec3(0, 0, -1),
]

function toPosition({ x, y, z }: Vec3): BlockPosition {
  return { x, y, z }
}

export function isSignBlock(block: Block): boolean {
  return block.name.endsWith('_sign')
}

export function isSupportedStorageBlock(block: Block): boolean {
  return (
    block.name === 'chest' ||
    block.name === 'trapped_chest' ||
    block.name === 'barrel' ||
    block.name.endsWith('_shulker_box')
  )
}

export class SignLocationScanner {
  public constructor(
    private readonly bot: Bot,
    private readonly options: SignLocationScannerOptions,
  ) {}

  public scan(): SignScanReport {
    const signPositions = this.bot.findBlocks({
      matching: isSignBlock,
      maxDistance: this.options.radius,
      count: this.options.limit,
      useExtraInfo: true,
    })
    const proposals: LocationProposal[] = []
    const issues: SignScanIssue[] = []

    for (const signPosition of signPositions) {
      const sign = this.bot.blockAt(signPosition, true)
      if (!sign) continue
      const [front, back] = sign.getSignText()
      const parsed = parseLocationSign(front, back)
      if (parsed.status === 'ignored') continue
      if (parsed.status === 'invalid') {
        issues.push({ signPosition: toPosition(signPosition), message: parsed.message })
        continue
      }

      const adjacentContainers = new Map<string, Block>()
      for (const offset of ADJACENT_OFFSETS) {
        const block = this.bot.blockAt(signPosition.plus(offset), false)
        if (block && isSupportedStorageBlock(block)) {
          adjacentContainers.set(positionKey(toPosition(block.position)), block)
        }
      }
      if (adjacentContainers.size !== 1) {
        issues.push({
          signPosition: toPosition(signPosition),
          message:
            adjacentContainers.size === 0
              ? 'label is not adjacent to a supported storage block'
              : 'label is adjacent to multiple supported storage blocks',
        })
        continue
      }

      const container = [...adjacentContainers.values()][0]
      if (!container) continue
      proposals.push({
        id: parsed.label.id,
        serverId: this.options.serverId,
        dimension: this.bot.game.dimension,
        position: toPosition(container.position),
        blockName: `minecraft:${container.name}`,
        roles: parsed.label.roles,
        categories: parsed.label.categories,
        source: {
          kind: 'sign',
          position: toPosition(signPosition),
          side: parsed.label.side,
        },
      })
    }

    return { scannedSigns: signPositions.length, proposals, issues }
  }
}
