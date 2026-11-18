export interface DelayComputation {
  seconds: number;
  status: 'EARLY' | 'ON_TIME' | 'LATE';
  formattedLabel: string;
}

/**
 * Delay = Actual Arrival Time - Scheduled Arrival Time (in seconds).
 * Negative values indicate early arrival; positive values indicate late arrival.
 */
export function calculateDelaySeconds(scheduledAt: Date, actualAt: Date): DelayComputation {
  const seconds = Math.round((actualAt.getTime() - scheduledAt.getTime()) / 1000);
  const absSeconds = Math.abs(seconds);
  const minutes = Math.floor(absSeconds / 60);
  const remSeconds = absSeconds % 60;

  if (seconds === 0) {
    return { seconds: 0, status: 'ON_TIME', formattedLabel: 'Exactly on time' };
  }

  const timePart = remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  if (seconds < 0) {
    return { seconds, status: 'EARLY', formattedLabel: `${timePart} early` };
  }
  return { seconds, status: 'LATE', formattedLabel: `${timePart} late` };
}

