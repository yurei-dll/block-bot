import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  LOCATION_STATE_SCHEMA_VERSION,
  designationTargetKey,
  type BlockPosition,
  type LocationApproval,
  type LocationDesignation,
  type LocationProposal,
  type LocationRole,
  type LocationStateFile,
  type LocationStatus,
} from './location-types.js'

export type ProposalUpsertResult =
  | { readonly status: 'created'; readonly designation: LocationDesignation }
  | { readonly status: 'updated'; readonly designation: LocationDesignation }
  | { readonly status: 'conflict'; readonly message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPosition(value: unknown): value is BlockPosition {
  return (
    isRecord(value) &&
    Number.isInteger(value.x) &&
    Number.isInteger(value.y) &&
    Number.isInteger(value.z)
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isRoleArray(value: unknown): value is LocationRole[] {
  return (
    isStringArray(value) &&
    value.every((role) => role === 'storage' || role === 'pickup' || role === 'dropoff')
  )
}

function isApproval(value: unknown): value is LocationApproval {
  return value === 'proposed' || value === 'approved' || value === 'rejected'
}

function isStatus(value: unknown): value is LocationStatus {
  return value === 'unverified' || value === 'verified' || value === 'stale'
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}

function isDesignation(value: unknown): value is LocationDesignation {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.serverId === 'string' &&
    typeof value.dimension === 'string' &&
    isPosition(value.position) &&
    typeof value.blockName === 'string' &&
    isRoleArray(value.roles) &&
    isStringArray(value.categories) &&
    isRecord(value.source) &&
    value.source.kind === 'sign' &&
    isPosition(value.source.position) &&
    (value.source.side === 'front' || value.source.side === 'back') &&
    isApproval(value.approval) &&
    isStatus(value.status) &&
    typeof value.discoveredAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.lastVerifiedAt === undefined || typeof value.lastVerifiedAt === 'string')
  )
}

function parseStateFile(contents: string): LocationStateFile {
  const value: unknown = JSON.parse(contents)
  if (!isRecord(value) || value.schemaVersion !== LOCATION_STATE_SCHEMA_VERSION) {
    throw new Error(`Unsupported location state schema; expected ${LOCATION_STATE_SCHEMA_VERSION}`)
  }
  if (!Array.isArray(value.locations) || !value.locations.every(isDesignation)) {
    throw new Error('Location state contains an invalid designation')
  }
  return { schemaVersion: LOCATION_STATE_SCHEMA_VERSION, locations: value.locations }
}

export class LocationRegistry {
  private readonly designations = new Map<string, LocationDesignation>()

  public constructor(private readonly filePath: string) {}

  public async load(): Promise<void> {
    this.designations.clear()
    let contents: string
    try {
      contents = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return
      throw error
    }

    const state = parseStateFile(contents)
    const loaded = new Map<string, LocationDesignation>()
    for (const designation of state.locations) {
      if (loaded.has(designation.id)) throw new Error(`Duplicate location ID ${designation.id}`)
      loaded.set(designation.id, designation)
    }
    this.designations.clear()
    for (const [id, designation] of loaded) this.designations.set(id, designation)
  }

  public list(): readonly LocationDesignation[] {
    return [...this.designations.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  public findApproved(role?: LocationRole, category?: string): readonly LocationDesignation[] {
    return this.list().filter(
      (designation) =>
        designation.approval === 'approved' &&
        designation.status === 'verified' &&
        (role === undefined || designation.roles.includes(role)) &&
        (category === undefined || designation.categories.includes(category)),
    )
  }

  public async upsertProposal(proposal: LocationProposal): Promise<ProposalUpsertResult> {
    const existingById = this.designations.get(proposal.id)
    const existingAtTarget = this.list().find(
      (designation) => designationTargetKey(designation) === designationTargetKey(proposal),
    )
    if (existingById && designationTargetKey(existingById) !== designationTargetKey(proposal)) {
      return {
        status: 'conflict',
        message: `ID ${proposal.id} already refers to another block`,
      }
    }
    if (existingAtTarget && existingAtTarget.id !== proposal.id) {
      return {
        status: 'conflict',
        message: `block is already designated as ${existingAtTarget.id}`,
      }
    }

    const now = new Date().toISOString()
    const authorityChanged =
      existingById !== undefined &&
      (existingById.blockName !== proposal.blockName ||
        !sameStrings(existingById.roles, proposal.roles) ||
        !sameStrings(existingById.categories, proposal.categories))
    const designation: LocationDesignation = {
      ...proposal,
      approval:
        existingById?.approval === 'approved' && authorityChanged
          ? 'proposed'
          : (existingById?.approval ?? 'proposed'),
      status: 'verified',
      discoveredAt: existingById?.discoveredAt ?? now,
      updatedAt: now,
      lastVerifiedAt: now,
    }
    this.designations.set(designation.id, designation)
    await this.save()
    return {
      status: existingById ? 'updated' : 'created',
      designation,
    }
  }

  public async setApproval(id: string, approval: LocationApproval): Promise<boolean> {
    const existing = this.designations.get(id)
    if (!existing) return false
    this.designations.set(id, {
      ...existing,
      approval,
      updatedAt: new Date().toISOString(),
    })
    await this.save()
    return true
  }

  public async setStatus(id: string, status: LocationStatus): Promise<boolean> {
    const existing = this.designations.get(id)
    if (!existing) return false
    this.designations.set(id, {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    })
    await this.save()
    return true
  }

  private async save(): Promise<void> {
    const state: LocationStateFile = {
      schemaVersion: LOCATION_STATE_SCHEMA_VERSION,
      locations: this.list(),
    }
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    await rename(temporaryPath, this.filePath)
  }
}
