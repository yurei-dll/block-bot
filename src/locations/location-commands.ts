import type { Bot } from 'mineflayer'
import type { LocationRegistry } from './location-registry.js'
import type { SignLocationScanner } from './sign-location-scanner.js'

export interface LocationCommandOptions {
  readonly operatorUsername?: string
  readonly prefix: string
}

export class LocationCommands {
  private busy = false

  public constructor(
    private readonly bot: Bot,
    private readonly registry: LocationRegistry,
    private readonly scanner: SignLocationScanner,
    private readonly options: LocationCommandOptions,
  ) {}

  public async handle(username: string, message: string): Promise<boolean> {
    const operator = this.options.operatorUsername
    if (!operator || username.toLowerCase() !== operator.toLowerCase()) return false
    if (message !== this.options.prefix && !message.startsWith(`${this.options.prefix} `)) return false

    if (this.busy) {
      this.bot.chat('Block Bot location command already running.')
      return true
    }
    this.busy = true
    try {
      const [command = 'help', argument] = message.slice(this.options.prefix.length).trim().split(/\s+/)
      switch (command.toLowerCase()) {
        case 'scan':
          await this.scan()
          break
        case 'locations':
          this.list()
          break
        case 'show':
          this.show(argument)
          break
        case 'approve':
          await this.setApproval(argument, 'approved')
          break
        case 'reject':
          await this.setApproval(argument, 'rejected')
          break
        default:
          this.bot.chat(
            `${this.options.prefix} scan | locations | show <id> | approve <id> | reject <id>`,
          )
      }
      return true
    } finally {
      this.busy = false
    }
  }

  private async scan(): Promise<void> {
    const report = this.scanner.scan()
    let created = 0
    let updated = 0
    let conflicts = 0
    for (const proposal of report.proposals) {
      const result = await this.registry.upsertProposal(proposal)
      if (result.status === 'created') created += 1
      else if (result.status === 'updated') updated += 1
      else {
        conflicts += 1
        console.warn(`[locations] ${proposal.id}: ${result.message}`)
      }
    }
    for (const issue of report.issues) {
      const { x, y, z } = issue.signPosition
      console.warn(`[locations] sign at ${x},${y},${z}: ${issue.message}`)
    }
    this.bot.chat(
      `Scanned ${report.scannedSigns} signs: ${created} proposed, ${updated} refreshed, ${report.issues.length} invalid, ${conflicts} conflicts.`,
    )
  }

  private list(): void {
    const locations = this.registry.list()
    if (locations.length === 0) {
      this.bot.chat('No Block Bot locations are registered.')
      return
    }
    const summary = locations
      .slice(0, 6)
      .map((location) => `${location.id}:${location.approval}/${location.status}`)
      .join(', ')
    const suffix = locations.length > 6 ? ` (+${locations.length - 6} more)` : ''
    this.bot.chat(`Locations: ${summary}${suffix}`)
  }

  private show(id: string | undefined): void {
    if (!id) {
      this.bot.chat(`Usage: ${this.options.prefix} show <id>`)
      return
    }
    const location = this.registry.list().find((candidate) => candidate.id === id.toLowerCase())
    if (!location) {
      this.bot.chat(`Unknown location ${id}.`)
      return
    }
    const { x, y, z } = location.position
    this.bot.chat(
      `${location.id}: ${location.approval}/${location.status}; ${location.roles.join('+')}; ${location.categories.join(',')} at ${x},${y},${z}`,
    )
  }

  private async setApproval(
    id: string | undefined,
    approval: 'approved' | 'rejected',
  ): Promise<void> {
    if (!id) {
      this.bot.chat(`Usage: ${this.options.prefix} ${approval === 'approved' ? 'approve' : 'reject'} <id>`)
      return
    }
    const changed = await this.registry.setApproval(id.toLowerCase(), approval)
    this.bot.chat(changed ? `${id} is now ${approval}.` : `Unknown location ${id}.`)
  }
}
