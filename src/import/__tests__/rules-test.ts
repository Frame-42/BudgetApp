import { isSavebackInvestment } from '../rules';

describe('isSavebackInvestment', () => {
  it('matches the exact bank type regardless of whitespace or case', () => {
    expect(isSavebackInvestment('  benefits_saveback ')).toBe(true);
  });

  it('does not exclude ordinary securities purchases', () => {
    expect(isSavebackInvestment('BUY')).toBe(false);
    expect(isSavebackInvestment('BENEFITS')).toBe(false);
  });
});
