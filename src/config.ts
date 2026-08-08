export type MinecraftAuth = 'offline' | 'microsoft'

export interface AppConfig {
  readonly minecraft: {
    readonly host: string
    readonly port: number
    readonly username: string
    readonly auth: MinecraftAuth
    readonly version?: string
  }
  readonly controller: {
    readonly decisionIntervalMs: number
    readonly minimumTaskRuntimeMs: number
    readonly switchMargin: number
  }
  readonly locations: {
    readonly operatorUsername?: string
    readonly commandPrefix: string
    readonly scanRadius: number
    readonly scanLimit: number
    readonly stateDirectory: string
    readonly serverId: string
  }
}

function integerFromEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = environment[name]
  if (rawValue === undefined || rawValue === '') return fallback

  const value = Number(rawValue)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

function numberFromEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
): number {
  const rawValue = environment[name]
  if (rawValue === undefined || rawValue === '') return fallback

  const value = Number(rawValue)
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be a number greater than or equal to ${minimum}`)
  }
  return value
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const auth = environment.MC_AUTH ?? 'offline'
  if (auth !== 'offline' && auth !== 'microsoft') {
    throw new Error('MC_AUTH must be either offline or microsoft')
  }

  const version = environment.MC_VERSION?.trim()
  const host = environment.MC_HOST?.trim() || 'localhost'
  const port = integerFromEnvironment(environment, 'MC_PORT', 25_565, 1, 65_535)
  const operatorUsername = environment.BOT_OPERATOR_USERNAME?.trim()
  const commandPrefix = environment.BOT_COMMAND_PREFIX?.trim() || '!bb'
  const stateDirectory = environment.BOT_STATE_DIRECTORY?.trim() || '.block-bot'
  if (/\s/.test(commandPrefix)) throw new Error('BOT_COMMAND_PREFIX cannot contain whitespace')

  return {
    minecraft: {
      host,
      port,
      username: environment.MC_USERNAME?.trim() || 'block-bot',
      auth,
      ...(version ? { version } : {}),
    },
    controller: {
      decisionIntervalMs: integerFromEnvironment(
        environment,
        'BOT_DECISION_INTERVAL_MS',
        500,
        100,
        60_000,
      ),
      minimumTaskRuntimeMs: integerFromEnvironment(
        environment,
        'BOT_MIN_TASK_RUNTIME_MS',
        1_000,
        0,
        60_000,
      ),
      switchMargin: numberFromEnvironment(environment, 'BOT_SWITCH_MARGIN', 10, 0),
    },
    locations: {
      ...(operatorUsername ? { operatorUsername } : {}),
      commandPrefix,
      scanRadius: integerFromEnvironment(
        environment,
        'BOT_LOCATION_SCAN_RADIUS',
        16,
        1,
        64,
      ),
      scanLimit: integerFromEnvironment(
        environment,
        'BOT_LOCATION_SCAN_LIMIT',
        128,
        1,
        1_024,
      ),
      stateDirectory,
      serverId: environment.BOT_SERVER_ID?.trim() || `${host}:${port}`,
    },
  }
}
