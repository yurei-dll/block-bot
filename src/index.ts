import mineflayer from 'mineflayer'
import { pathfinder } from 'mineflayer-pathfinder'
import { resolve } from 'node:path'
import { loadConfig } from './config.js'
import { observeWorld } from './domain/world-snapshot.js'
import { LocationCommands } from './locations/location-commands.js'
import { LocationRegistry } from './locations/location-registry.js'
import { SignLocationScanner } from './locations/sign-location-scanner.js'
import { locationStateFileName } from './locations/location-state-path.js'
import { PathfinderNavigator } from './navigation/pathfinder-navigator.js'
import { StarterPolicy } from './policy/starter-policy.js'
import { TaskController } from './runtime/task-controller.js'
import { EatTask } from './tasks/eat-task.js'
import { IdleTask } from './tasks/idle-task.js'
import { RetrieveFoodTask } from './tasks/retrieve-food-task.js'

const config = loadConfig()
const bot = mineflayer.createBot(config.minecraft)
bot.loadPlugin(pathfinder)

const locationRegistry = new LocationRegistry(
  resolve(config.locations.stateDirectory, locationStateFileName(config.locations.serverId)),
)
const locationScanner = new SignLocationScanner(bot, {
  serverId: config.locations.serverId,
  radius: config.locations.scanRadius,
  limit: config.locations.scanLimit,
})
const locationCommands = new LocationCommands(bot, locationRegistry, locationScanner, {
  ...(config.locations.operatorUsername
    ? { operatorUsername: config.locations.operatorUsername }
    : {}),
  prefix: config.locations.commandPrefix,
})
let locationsReady = false
const navigator = new PathfinderNavigator(bot)
const retrieveFoodTask = new RetrieveFoodTask(
  locationRegistry,
  navigator,
  config.behaviors.retrieveFood,
)

const controller = new TaskController(
  bot,
  [new EatTask(), retrieveFoodTask, new IdleTask()],
  new StarterPolicy(),
  {
    ...config.controller,
    observe: (activeTaskId) => observeWorld(bot, activeTaskId),
    onDecision: ({ task, score }, snapshot) => {
      console.info('[decision]', {
        task: task.id,
        score,
        health: snapshot.health,
        food: snapshot.food,
      })
    },
    onTaskResult: (task, result) => console.info('[task]', task.id, result),
    onError: (error) => console.error('[controller]', error),
  },
)

bot.once('spawn', async () => {
  console.info(`[minecraft] spawned as ${bot.username} on ${config.minecraft.host}:${config.minecraft.port}`)
  try {
    await locationRegistry.load()
    locationsReady = true
    console.info(`[locations] loaded ${locationRegistry.list().length} designations`)
    if (config.locations.operatorUsername) {
      console.info(
        `[locations] commands enabled for ${config.locations.operatorUsername}: ${config.locations.commandPrefix} help`,
      )
    } else {
      console.info('[locations] commands disabled; set BOT_OPERATOR_USERNAME to enable them')
    }
  } catch (error) {
    console.error('[locations] failed to load; location commands are disabled', error)
  }
  controller.start()
})

bot.on('chat', (username, message) => {
  if (!locationsReady || username === bot.username) return
  void locationCommands.handle(username, message).catch((error: unknown) => {
    console.error('[locations] command failed', error)
    bot.chat('Block Bot location command failed; check the server log.')
  })
})

bot.on('kicked', (reason) => console.error('[minecraft] kicked', reason))
bot.on('error', (error) => console.error('[minecraft] error', error))
bot.on('end', (reason) => {
  console.info('[minecraft] disconnected', reason)
  void controller.stop()
})

async function shutDown(signal: NodeJS.Signals): Promise<void> {
  console.info(`[process] received ${signal}`)
  await controller.stop()
  bot.quit('Shutting down')
}

process.once('SIGINT', () => void shutDown('SIGINT'))
process.once('SIGTERM', () => void shutDown('SIGTERM'))
