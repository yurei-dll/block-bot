import type { BlockPosition } from '../locations/location-types.js'

export interface Navigator {
  goNear(position: BlockPosition, range: number, signal: AbortSignal): Promise<void>
}
