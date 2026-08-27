/** Content transcribed from the design. One place to swap in real data later. */

export const budget = {
  month: 'August',
  greeting: 'Good evening, Lena',
  initial: 'L',
  leftToSpend: 1240,
  monthlyBudget: 3200,
  daysRemaining: 11,
  percentUsed: 61,
  aheadOfPace: 180,
  dailyPace: 71,
  dailyAvailable: 113,
  /** Bar heights, as a fraction of the tile. Index 5 is today. */
  week: [0.38, 0.62, 0.3, 0.78, 0.48, 0.88, 0.16],
  weekActiveIndex: 5,
};

export const categories = [
  { name: 'Dining', spent: 320, limit: 400, fill: 0.8, alpha: 0.9 },
  { name: 'Groceries', spent: 265, limit: 350, fill: 0.76, alpha: 0.65 },
  { name: 'Transport', spent: 96, limit: 180, fill: 0.53, alpha: 0.45 },
];

export const categoryCount = 7;

export const nextOut = { label: 'Rent · Sep 1', amount: '$1,450' };

export const spend = {
  total: '1,960',
  transactionCount: 48,
  average: 41,
  groups: [
    {
      title: 'Today',
      items: [
        { name: 'Blue Bottle', category: 'DINING', amount: '$6.40' },
        { name: 'Migros', category: 'GROCERIES', amount: '$38.10' },
        { name: 'SBB Ticket', category: 'TRANSPORT', amount: '$12.80' },
      ],
    },
    {
      title: 'Yesterday',
      items: [
        { name: 'Kino Riffraff', category: 'LEISURE', amount: '$21.00' },
        { name: 'Spotify', category: 'SUBSCRIPTION', amount: '$11.99' },
        { name: 'Salary', category: 'INCOME', amount: '+$4,200', income: true },
      ],
    },
  ],
};

export const addCategories = ['Dining', 'Groceries', 'Transport', 'Leisure'];

export const trends = {
  monthlyAverage: '2,780',
  delta: '−6% vs spring',
  /** Bar heights in px against the design's 96px plot. */
  months: [
    { label: 'MAR', height: 62 },
    { label: 'APR', height: 78 },
    { label: 'MAY', height: 54 },
    { label: 'JUN', height: 70 },
    { label: 'JUL', height: 44 },
    { label: 'AUG', height: 50, active: true },
  ],
  paceNote: '$160 lighter than the same day in July.',
  split: [
    { name: 'Housing', percent: '46%', alpha: 0.95, dash: 125, offset: 0 },
    { name: 'Dining', percent: '19%', alpha: 0.66, dash: 50.5, offset: -127.2 },
    { name: 'Groceries', percent: '15%', alpha: 0.46, dash: 39.5, offset: -179.7 },
    { name: 'Transport', percent: '10%', alpha: 0.3, dash: 25.6, offset: -221.2 },
    { name: 'Other', percent: '10%', alpha: 0.16, dash: 25.6, offset: -248.8 },
  ],
  insight: 'Dining is your steadiest saving — down three months running.',
};

export const profile = {
  name: 'Lena Brunner',
  since: 'MEMBER SINCE 2024',
  netWorth: '28,410',
  delta: '+$620 this month',
  accounts: [
    { name: 'Checking', value: '$3,140' },
    { name: 'Savings', value: '$25,900' },
    { name: 'Credit card', value: '−$630' },
  ],
  settings: [
    { name: 'Monthly budget', value: '$3,200' },
    { name: 'Categories', value: '7' },
    { name: 'Weekly recap', value: 'SUN' },
    { name: 'Appearance', value: 'DARK' },
  ],
};
