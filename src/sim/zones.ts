/**
 * Zone levels: the endless row sequence is grouped into fixed-size zones so a
 * death respawns the player at the start of the current zone instead of row 0.
 * All of the zone arithmetic lives here as pure functions, shared by the
 * generator, the simulation and the HUD.
 */
export const ZONE_ROWS = 10;

/** Zero-based zone of a row. Zone 0 is the opening stretch before row 10. */
export function zoneIndex(z: number): number {
  return Math.floor(z / ZONE_ROWS);
}

/** First row of the zone that `z` sits in. */
export function zoneStart(z: number): number {
  return zoneIndex(z) * ZONE_ROWS;
}

/**
 * True on the first row of every zone past the opening stretch. These rows are
 * the checkpoints: the generator forces them to safe grass by the same
 * fairness rule as the safe row after every river.
 */
export function isZoneBoundary(z: number): boolean {
  return z > 0 && z % ZONE_ROWS === 0;
}

/** Human-readable zone name; zone 0 is "ZONE 1" to a child. */
export function zoneLabel(z: number): string {
  return `ZONE ${zoneIndex(z) + 1}`;
}
