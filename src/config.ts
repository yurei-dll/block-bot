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
  return {
    minecraft: {
      host: environment.MC_HOST?.trim() || 'localhost',
      port: integerFromEnvironment(environment, 'MC_PORT', 25_565, 1, 65_535),
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
  }
}
