import { createHash } from 'node:crypto'

export function locationStateFileName(serverId: string): string {
  const serverHash = createHash('sha256').update(serverId).digest('hex').slice(0, 16)
  return `locations.${serverHash}.v1.json`
}
