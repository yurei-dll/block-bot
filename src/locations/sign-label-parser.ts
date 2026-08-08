import type { LocationRole } from './location-types.js'

export const BLOCK_BOT_SIGN_MARKER = '[block-bot]'

export interface ParsedLocationLabel {
  readonly id: string
  readonly roles: readonly LocationRole[]
  readonly categories: readonly string[]
  readonly side: 'front' | 'back'
}

export type SignLabelParseResult =
  | { readonly status: 'ignored' }
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'parsed'; readonly label: ParsedLocationLabel }

const VALID_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/
const VALID_CATEGORY = /^[a-z0-9][a-z0-9_:-]{0,63}$/
const VALID_ROLES = new Set<LocationRole>(['storage', 'pickup', 'dropoff'])

function normalizeText(text: string): string {
  return text.replace(/§[0-9a-fk-or]/gi, '').replace(/\r/g, '').trim()
}

function parseList(line: string): string[] {
  return [...new Set(line.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))]
}

function parseSide(text: string, side: 'front' | 'back'): SignLabelParseResult {
  const lines = normalizeText(text).split('\n').map((line) => line.trim())
  if (lines[0]?.toLowerCase() !== BLOCK_BOT_SIGN_MARKER) return { status: 'ignored' }
  if (lines.length > 4 && lines.slice(4).some(Boolean)) {
    return { status: 'invalid', message: `${side} label has more than four non-empty lines` }
  }

  const id = lines[1]?.toLowerCase() ?? ''
  if (!VALID_ID.test(id)) {
    return {
      status: 'invalid',
      message: `${side} label ID must match ${VALID_ID.source}`,
    }
  }

  const roleValues = parseList(lines[2] ?? '')
  if (roleValues.length === 0) {
    return { status: 'invalid', message: `${side} label must declare at least one role` }
  }
  const invalidRole = roleValues.find((role) => !VALID_ROLES.has(role as LocationRole))
  if (invalidRole) {
    return { status: 'invalid', message: `${side} label contains unknown role ${invalidRole}` }
  }

  const categories = parseList(lines[3] ?? '')
  if (categories.length === 0) {
    return { status: 'invalid', message: `${side} label must declare at least one category` }
  }
  const invalidCategory = categories.find((category) => !VALID_CATEGORY.test(category))
  if (invalidCategory) {
    return { status: 'invalid', message: `${side} label contains invalid category ${invalidCategory}` }
  }

  return {
    status: 'parsed',
    label: {
      id,
      roles: roleValues as LocationRole[],
      categories,
      side,
    },
  }
}

function labelsMatch(left: ParsedLocationLabel, right: ParsedLocationLabel): boolean {
  return (
    left.id === right.id &&
    left.roles.join(',') === right.roles.join(',') &&
    left.categories.join(',') === right.categories.join(',')
  )
}

export function parseLocationSign(front: string, back?: string): SignLabelParseResult {
  const frontResult = parseSide(front, 'front')
  const backResult = parseSide(back ?? '', 'back')

  if (frontResult.status === 'invalid') return frontResult
  if (backResult.status === 'invalid') return backResult
  if (frontResult.status === 'ignored') return backResult
  if (backResult.status === 'ignored') return frontResult
  if (!labelsMatch(frontResult.label, backResult.label)) {
    return { status: 'invalid', message: 'front and back labels disagree' }
  }
  return frontResult
}
