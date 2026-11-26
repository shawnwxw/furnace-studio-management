const wholeDollars = new Intl.NumberFormat('en-AU');

// Formats exact cents as Australian dollars, including negative balances.
export function formatAustralianDollars(cents: number | bigint) {
  const amount = BigInt(cents);
  const magnitude = amount < BigInt(0) ? -amount : amount;
  const whole = wholeDollars.format(magnitude / BigInt(100));
  const fraction = String(magnitude % BigInt(100)).padStart(2, '0');
  return `${amount < BigInt(0) ? '-' : ''}A$${whole}.${fraction}`;
}
