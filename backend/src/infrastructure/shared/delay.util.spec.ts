import { calculateDelaySeconds } from './delay.util.js';

describe('calculateDelaySeconds', () => {
  const scheduled = new Date('2026-11-17T03:00:00.000Z');

  it('computes negative seconds for early arrivals', () => {
    const actual = new Date('2026-11-17T02:57:00.000Z');
    expect(calculateDelaySeconds(scheduled, actual)).toEqual({
      seconds: -180,
      status: 'EARLY',
      formattedLabel: '3m early',
    });
  });

  it('computes zero seconds for exact on-time arrivals', () => {
    expect(calculateDelaySeconds(scheduled, new Date('2026-11-17T03:00:00.000Z'))).toEqual({
      seconds: 0,
      status: 'ON_TIME',
      formattedLabel: 'Exactly on time',
    });
  });

  it('computes positive seconds with minutes and remaining seconds for late arrivals', () => {
    const actual = new Date('2026-11-17T03:04:15.000Z');
    expect(calculateDelaySeconds(scheduled, actual)).toEqual({
      seconds: 255,
      status: 'LATE',
      formattedLabel: '4m 15s late',
    });
  });
});

