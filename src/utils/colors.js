export const USER_COLORS = [
  { color: '#4285f4', light: 'rgba(66,133,244,0.18)' },   // Blue
  { color: '#ea4335', light: 'rgba(234,67,53,0.18)' },    // Red
  { color: '#34a853', light: 'rgba(52,168,83,0.18)' },    // Green
  { color: '#ff6d01', light: 'rgba(255,109,1,0.18)' },    // Orange
  { color: '#46bdc6', light: 'rgba(70,189,198,0.18)' },   // Teal
  { color: '#9334e6', light: 'rgba(147,52,230,0.18)' },   // Purple
  { color: '#e91e63', light: 'rgba(233,30,99,0.18)' },    // Pink
  { color: '#795548', light: 'rgba(121,85,72,0.18)' },    // Brown
];

/**
 * Deterministically pick a color from the palette based on user name.
 */
export function getColorForUser(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}
