import mineflayer from 'mineflayer'
import { pathfinder } from 'mineflayer-pathfinder'
import { loadConfig } from './config.js'
import { observeWorld } from './domain/world-snapshot.js'
import { StarterPolicy } from './policy/starter-policy.js'
import { TaskController } from './runtime/task-controller.js'
import { EatTask } from './tasks/eat-task.js'
import { IdleTask } from './tasks/idle-task.js'

const config = loadConfig()
const bot = mineflayer.createBot(config.minecraft)
bot.loadPlugin(pathfinder)

const controller = new TaskController(
  bot,
  [new EatTask(), new IdleTask()],
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

bot.once('spawn', () => {
  console.info(`[minecraft] spawned as ${bot.username} on ${config.minecraft.host}:${config.minecraft.port}`)
  controller.start()
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
