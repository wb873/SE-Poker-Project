# Leaderboard integration after merging main

Both the main-menu sidebar and `/leaderboard` page use the same component and
`GET /api/leaderboard` response: `mode`, `label`, `topPlayers`, `currentPlayer`,
`month`, and `timeZone`. The selected named season or Eastern-time current month
appears in both places. Guests can view public rankings but never earn scores.
An expired browser session falls back to public rankings with a sign-in link.

## Settled gameplay

The Socket.IO table join now sends the bearer token. The server verifies it with
the same session logic used by HTTP routes; the account ID and username come
from that verified account. A guest name alone cannot earn an account ranking.
The account ID is captured at the start of a hand, so joining/reconnecting in the
middle of a hand cannot turn an unowned hand into a registered result.

`tableGame` emits settlement snapshots before removing departing players' seats.
`TableController` forwards these through `LeaderboardController.recordHand` to
`LeaderboardDao.recordResult`. This includes raises, folds, swap fees, timer
folds and players leaving mid-hand. The net is the ending balance minus the
balance before the ante. Guests and players sitting out are excluded.

The older `/api/game` routes also use the same recording helper and require the
owning account for a registered game's reads/actions/next hand. Both engines
generate a unique hand ID. Table results append the account ID so each player's
result is distinct. Hand IDs, account ownership and settlement timestamps are
server-side fields, not accepted chip totals from the browser.

Game recording calls:

```js
await LeaderboardDao.recordResult(accountId, netChips, settledAt, handResultId);
```

The fourth argument enables deduplication. Each bucket's atomic update adds the
result ID alongside its score increment. Duplicate calls cannot increment the
same bucket again. A retry after one bucket saved and another failed can safely
finish the missing bucket while the same bucket settings still apply. Callers
without a result ID retain the earlier non-idempotent helper behavior.

Monthly and seasonal writes are separate operations. Recording failures are
logged and do not interrupt gameplay; there is no durable retry queue. A server
crash or database outage can still leave a result unsaved. Account balances and
lifetime statistics are not updated by the leaderboard helper; the incoming
table's chip balances remain in memory. Future durable settlement should put
account balances and score recording under a shared transaction/retry mechanism.

## Saved seasons and resets

Admin-only `GET/PATCH /api/admin/leaderboard` supports:

```json
{ "action": "start-season", "name": "Winter Championship" }
{ "action": "select-season", "seasonId": "saved season ID" }
{ "action": "delete-season", "seasonId": "saved season ID" }
{ "action": "set-mode", "mode": "monthly" }
{ "action": "reset", "target": "monthly" }
{ "action": "reset", "target": "seasonal", "seasonId": "saved season ID" }
```

Creating a season saves and selects it without replacing other seasons. Selecting
a saved season displays it and directs new results to it. Monthly results always
accumulate; showing monthly preserves the last selected season's tracking.
Other saved seasons retain their scores without accumulating new results.
Deleting the selected season returns users to monthly and stops season tracking.
Reset clears only the chosen leaderboard, preserving a season's ID/name/button.
Reset/delete require confirmation in the dashboard.

Reset rotates the score bucket instead of deleting stored scores. Settlements
dated before a reset/start do not populate the new bucket. Old monthly records
and inaccessible reset/deleted buckets remain stored. Settings edits use revision
checks to prevent simultaneous admins from losing each other's saves. Legacy
single-season settings retain their original score bucket on migration.

Ranks sort by net chips descending and account ID ascending for stable ties.
Only registered, non-banned accounts with a recorded hand rank. Top ten and the
current player's rank beyond ten are returned; a top-ten player appears once.
Calendar month boundaries use America/New_York including daylight saving time.
The panel refreshes every minute, on focus, and on manual refresh.

## Incoming hand-history implementation

`HandResultDao` and its tests are retained as hand-history code, but its separate
top-20 aggregation no longer drives displayed rankings and new settlements use
`MonthlyStats`. Existing hand-history documents are not deleted or automatically
backfilled into monthly/seasonal totals. There is only one public leaderboard
route registration and one response format.

## Verification

Focused Jest checks use mocked database operations:

```text
node node_modules/jest/bin/jest.js game.test.js tableGame.test.js controller/TableController.test.js controller/LeaderboardController.test.js controller/AdminFeatures.test.js model/LeaderboardDao.test.js model/LeaderboardSettingsDao.test.js util/LeaderboardPeriod.test.js --runInBand --cache=false
node --test client/src/leaderboard_api.test.mjs
npm --prefix client run build
```

Avoid running the database DAO integration tests against a shared database:
their setup/teardown deletes test collections.
