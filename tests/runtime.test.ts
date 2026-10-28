import { describe, expect, it } from 'vitest';
import { projectFromEnv, spendCap } from '../src/runtime-config.js';
describe('operator configuration', () => {
  it('requires member IDs and approvers within the member list', () => {
    expect(() => projectFromEnv({})).toThrow();
    expect(() => projectFromEnv({ DISCORD_GUILD_ID: '10000000000000001', DISCORD_CHANNEL_ID: '10000000000000002', DISCORD_MEMBER_IDS: '10000000000000003', DISCORD_APPROVER_IDS: '10000000000000004' })).toThrow('Approvers must');
  });
  it('defaults to no spending, then uses the smaller authorized allowance and app ceiling', () => {
    expect(spendCap({})).toBe(0); expect(spendCap({ APP_MAX_SPEND_USD: '120', APP_AUTHORIZED_ALLOWANCE_USD: '0.5' })).toBe(0.5);
    expect(spendCap({ APP_MAX_SPEND_USD: '150', APP_AUTHORIZED_ALLOWANCE_USD: '150' })).toBe(120);
    expect(() => spendCap({ APP_MAX_SPEND_USD: 'NaN' })).toThrow();
  });
});
