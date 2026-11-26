export const planColors = [
  { name: 'Blood orange', hue: 11 },
  { name: 'Rose', hue: 345 },
  { name: 'Gold', hue: 45 },
  { name: 'Lime', hue: 85 },
  { name: 'Mint', hue: 150 },
  { name: 'Teal', hue: 180 },
  { name: 'Sky', hue: 205 },
  { name: 'Indigo', hue: 235 },
  { name: 'Violet', hue: 275 },
  { name: 'Pink', hue: 315 },
];

// Chooses an initial hue from the palette for a new schedule.
export function randomPlanColor() {
  return planColors[Math.floor(Math.random() * planColors.length)].hue;
}

// Derives a stable fallback hue from the ID of a schedule saved without a colour.
export function defaultPlanColor(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}
