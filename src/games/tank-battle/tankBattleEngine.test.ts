import { describe, expect, test } from 'vitest';
import { createTankBattleTestSnapshot } from './tankBattleEngine';

describe('Tank Battle AP and base approach rules', () => {
  test.each(Array.from({ length: 10 }, (_, index) => index + 1))(
    'level %i generates pickups, recovery, and fortified-base rules',
    (level) => {
      const snapshot = createTankBattleTestSnapshot(level);

      expect(snapshot.activePickups).toBe(5);
      expect(snapshot.baseApproachCells.length).toBeGreaterThan(0);
      expect(snapshot.baseOverheadColumnsBlocked).toBe(true);
      expect(snapshot.bottomDefenseCellsBlocked).toBe(true);
      expect(snapshot.piercingEnemyDirection).not.toBeNull();
      expect(snapshot.activePickupsAfterRefill).toBe(5);
      expect(snapshot.pickupRespawnedElsewhere).toBe(true);
      expect(snapshot.piercingDestroyedBrickCount).toBe(2);
      expect(snapshot.bulletStoppedAfterTwoBricks).toBe(true);
      expect(snapshot.stuckEnemyEscaped).toBe(true);
      expect(snapshot.stuckRecoveryWasMovementOnly).toBe(true);
      expect(snapshot.openAreaWatchdogRecovered).toBe(true);
      expect(snapshot.openAreaWatchdogWasMovementOnly).toBe(true);
      expect(snapshot.screenshotAreaWatchdogRecovered).toBe(true);
      expect(snapshot.screenshotAreaWatchdogWasMovementOnly).toBe(true);
      expect(snapshot.flatWallSlideWorked).toBe(true);
      expect(snapshot.wallTurnRecoveryStarted).toBe(true);
      expect(snapshot.wallTurnRecoveryRepeatedSameSide).toBe(true);
      expect(snapshot.wallTurnRecoveryResetAfterOneCell).toBe(true);
      expect(snapshot.verticalOscillationEscaped).toBe(true);
      expect(snapshot.horizontalOscillationEscaped).toBe(true);
      expect(snapshot.playerContactAvoided).toBe(true);
      expect(snapshot.enemyContactAvoided).toBe(true);
    },
  );
});
