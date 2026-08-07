# block-bot

A TypeScript Mineflayer bot built around pluggable high-level task prioritization.
Tasks contain the deterministic code needed to do something in Minecraft. A policy
scores the currently valid tasks and the controller runs the highest-priority one.

The starter policy is deliberately tiny. It eats available food when hungry and
otherwise idles. A future brain.js policy can implement the same `PriorityPolicy`
interface without changing the bot's task implementations.

## Architecture

```text
Mineflayer -> WorldSnapshot -> PriorityPolicy -> TaskController -> BotTask
                                      ^                |
                                      +-- task result -+
```

- `src/domain`: bounded, model-friendly observations of Minecraft state
- `src/policy`: task scoring and ranking
- `src/runtime`: serialized execution, cancellation, and switching hysteresis
- `src/tasks`: independently testable task implementations

The controller masks unavailable tasks by calling `canRun` before asking the policy
to score candidates. It also requires a configurable score margin and minimum runtime
before switching tasks, preventing a learned policy from rapidly oscillating.

## Run locally

Requirements: Node.js 22 or newer and a Minecraft Java server that permits the
configured account.

```bash
npm install
cp .env.example .env
npm run dev
```

The defaults connect an offline-mode bot named `block-bot` to `localhost:25565`.
For an authenticated server, set `MC_AUTH=microsoft`; Mineflayer will guide the
device-code login flow. Do not commit `.env` or account credentials.

Useful commands:

```bash
npm test
npm run check
npm run build
npm start
```

## Adding a task

Implement `BotTask`, give it a stable ID, and add it to the task list in `src/index.ts`.
`canRun` should perform capability checks; `run` should honor its `AbortSignal` at
safe interruption points and return a structured result.

Then teach the active policy how to score the new ID. Eventually, a learned policy
can convert `WorldSnapshot` into a score for each task. Keep hard capability and
safety checks outside the learned model.

## Next milestones

1. Expand `WorldSnapshot` with nearby threats, known locations, and task progress.
2. Add movement-backed tasks using the already loaded pathfinder plugin.
3. Persist structured decisions and task outcomes as training examples.
4. Add a `BrainPolicy` implementation and load versioned model weights.
