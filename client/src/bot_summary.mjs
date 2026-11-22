// Short text for a lobby's bot setting, e.g. "No", "2 (hard)" or "3 (1 easy, 2 hard)"
const LEVELS = ["easy", "medium", "hard"];

export function describeBots(bots) {
  if (!bots?.enabled || !bots.amount) return "No";
  const difficulties = bots.difficulties?.length ? bots.difficulties : ["medium"];
  const counts = LEVELS
    .map((level) => [level, difficulties.filter((d) => d === level).length])
    .filter(([, count]) => count > 0);
  if (counts.length === 1) return `${bots.amount} (${counts[0][0]})`;
  return `${bots.amount} (${counts.map(([level, count]) => `${count} ${level}`).join(", ")})`;
}
