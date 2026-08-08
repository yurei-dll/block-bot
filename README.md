# block-bot

A TypeScript Mineflayer bot built around pluggable high-level task prioritization.
Tasks contain the deterministic code needed to do something in Minecraft. A policy
scores the currently valid tasks and the controller runs the highest-priority one.

The starter policy is deliberately tiny. When hungry it eats carried food, or retrieves
safe food from the nearest approved pantry before eating; otherwise it idles. A future
brain.js policy can implement the same `PriorityPolicy` interface without changing the
bot's task implementations.

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
- `src/locations`: persistent block designations and conservative sign discovery

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
npm run smoke:imports
npm start
```

## Adding a task

Implement `BotTask`, give it a stable ID, and add it to the task list in `src/index.ts`.
`canRun` should perform capability checks; `run` should honor its `AbortSignal` at
safe interruption points and return a structured result.

Then teach the active policy how to score the new ID. Eventually, a learned policy
can convert `WorldSnapshot` into a score for each task. Keep hard capability and
safety checks outside the learned model.

## Designating storage locations

Block Bot can discover labeled chests, trapped chests, barrels, and shulker boxes.
Discovery does not grant permission: scans create `proposed` records, and the configured
operator must approve each record before future tasks can query it as an authorized
pickup or dropoff location.

Put a sign directly adjacent to one supported container using this four-line grammar:

```text
[block-bot]
home-pantry
storage,pickup
food
```

- Line 1 is the required marker.
- Line 2 is a stable lowercase ID using letters, numbers, `_`, or `-`.
- Line 3 is one or more roles: `storage`, `pickup`, or `dropoff`.
- Line 4 is a comma-separated list of semantic item categories.

Configure the only player allowed to issue location commands:

```dotenv
BOT_OPERATOR_USERNAME=YourMinecraftName
```

Then use Minecraft chat:

```text
!bb scan
!bb locations
!bb show home-pantry
!bb approve home-pantry
!bb reject home-pantry
```

Ordinary signs are ignored. Invalid or ambiguous labels are reported without creating
a record. Moving an existing ID to another block is rejected, and changing the roles
or categories of an approved sign resets it to `proposed` so the expanded authority
must be approved again.

World-specific state is written atomically to a server-ID-hashed file under `.block-bot/`,
which is gitignored and created with owner-only file permissions. The file stores server,
dimension, coordinates, roles, categories, provenance, approval, and verification
state—not live Mineflayer block references or container contents. `BOT_SERVER_ID` can
give the server a stable logical name; otherwise `host:port` is used.

## Retrieving food

`RetrieveFoodTask` becomes available only when the bot is hungry, carries no edible
item, and has an approved, verified location in the current dimension with both the
`pickup` role and `food` category. It selects the nearest eligible location rather than
depending on a hard-coded pantry ID.

The task currently:

1. Navigates within interaction range using a conservative Pathfinder profile.
2. Revalidates the designated block before opening it.
3. Marks the location stale if the expected storage block has disappeared.
4. Opens the container and chooses the best ordinary safe food by effective quality.
5. Withdraws only enough to cover the current hunger, capped at four items by default.
6. Closes the container in a `finally` block and returns control to `EatTask`.

Navigation cannot dig, place scaffolding, tower, parkour, sprint, or open doors. This
intentionally favors getting stuck safely over modifying the world. Failed food sources
receive independent cooldowns, allowing another approved pantry to be tried.

Potentially harmful, teleporting, unusually valuable, or non-hand-consumable foods are
excluded from automatic retrieval for now, including rotten flesh, spider eyes,
pufferfish, poisonous potatoes, raw chicken, chorus fruit, suspicious stew, cake, and
golden apples.

Relevant tuning variables:

```dotenv
BOT_RETRIEVE_FOOD_MAX_ITEMS=4
BOT_RETRIEVE_FOOD_RETRY_COOLDOWN_MS=10000
BOT_RETRIEVE_FOOD_GOAL_RANGE=2
```

## Next milestones

1. Validate retrieval, cancellation, and stale-location recovery on a controlled server.
2. Expand `WorldSnapshot` with nearby threats, known locations, and task progress.
3. Persist structured decisions and task outcomes as training examples.
4. Add a `BrainPolicy` implementation and load versioned model weights.
