export const LOCATION_STATE_SCHEMA_VERSION = 1 as const

export type LocationRole = 'storage' | 'pickup' | 'dropoff'
export type LocationApproval = 'proposed' | 'approved' | 'rejected'
export type LocationStatus = 'unverified' | 'verified' | 'stale'

export interface BlockPosition {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface SignLocationSource {
  readonly kind: 'sign'
  readonly position: BlockPosition
  readonly side: 'front' | 'back'
}

export interface LocationDesignation {
  readonly id: string
  readonly serverId: string
  readonly dimension: string
  readonly position: BlockPosition
  readonly blockName: string
  readonly roles: readonly LocationRole[]
  readonly categories: readonly string[]
  readonly source: SignLocationSource
  readonly approval: LocationApproval
  readonly status: LocationStatus
  readonly discoveredAt: string
  readonly updatedAt: string
  readonly lastVerifiedAt?: string
}

export interface LocationProposal {
  readonly id: string
  readonly serverId: string
  readonly dimension: string
  readonly position: BlockPosition
  readonly blockName: string
  readonly roles: readonly LocationRole[]
  readonly categories: readonly string[]
  readonly source: SignLocationSource
}

export interface LocationStateFile {
  readonly schemaVersion: typeof LOCATION_STATE_SCHEMA_VERSION
  readonly locations: readonly LocationDesignation[]
}

export function positionKey(position: BlockPosition): string {
  return `${position.x},${position.y},${position.z}`
}

export function designationTargetKey(
  designation: Pick<LocationDesignation | LocationProposal, 'serverId' | 'dimension' | 'position'>,
): string {
  return `${designation.serverId}:${designation.dimension}:${positionKey(designation.position)}`
}
