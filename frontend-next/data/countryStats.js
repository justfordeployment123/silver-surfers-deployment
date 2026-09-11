/**
 * Curated "reach" stats shown on hero globe hover.
 *
 * PLACEHOLDER DATA — these figures are illustrative approximations, not
 * sourced/cited numbers. Per animation.md (Docs), replace with real figures
 * from a citable source (World Bank, ITU, Pew Research, Statista, etc.)
 * before this is treated as a real marketing claim. Keyed by ISO 3166-1
 * numeric code (as a zero-padded string) to match world-countries.json.
 *
 * Rescaled so the listed countries sum to ~$12.3T, consistent with the
 * "$12T+ buying power" headline stat on the homepage (app/(site)/page.js) —
 * these 14 markets previously summed to ~$14.7T on their own, which
 * contradicted that sitewide total. US buying power kept at $8.3T (the
 * commonly-cited figure for the domestic 50+ "longevity economy"); every
 * other country scaled down proportionally to close the gap.
 */
const countryStats = {
  '840': { name: 'United States',  buyingPower: '$8.3T buying power (50+)',  reach: '~86M adults 50+ online' },
  '826': { name: 'United Kingdom', buyingPower: '$410B buying power (50+)', reach: '~19M adults 50+ online' },
  '124': { name: 'Canada',         buyingPower: '$265B buying power (50+)', reach: '~11M adults 50+ online' },
  '036': { name: 'Australia',      buyingPower: '$195B buying power (50+)', reach: '~7M adults 50+ online' },
  '276': { name: 'Germany',        buyingPower: '$490B buying power (50+)', reach: '~28M adults 50+ online' },
  '250': { name: 'France',         buyingPower: '$340B buying power (50+)', reach: '~21M adults 50+ online' },
  '392': { name: 'Japan',          buyingPower: '$570B buying power (50+)', reach: '~48M adults 50+ online' },
  '528': { name: 'Netherlands',    buyingPower: '$130B buying power (50+)', reach: '~6M adults 50+ online' },
  '752': { name: 'Sweden',         buyingPower: '$90B buying power (50+)',  reach: '~3M adults 50+ online' },
  '380': { name: 'Italy',          buyingPower: '$270B buying power (50+)', reach: '~19M adults 50+ online' },
  '724': { name: 'Spain',          buyingPower: '$195B buying power (50+)', reach: '~14M adults 50+ online' },
  '356': { name: 'India',          buyingPower: '$690B buying power (50+)', reach: '~140M adults 50+ online' },
  '076': { name: 'Brazil',         buyingPower: '$300B buying power (50+)', reach: '~34M adults 50+ online' },
  '710': { name: 'South Africa',   buyingPower: '$55B buying power (50+)',  reach: '~5M adults 50+ online' },
};

export default countryStats;
