export const npr = (n: number) => 'NPR ' + Math.round(n).toLocaleString('en-US');

export function minutesLabel(m: number): string {
  if (m < 1) return 'just now';
  if (m === 1) return '1 min';
  return `${m} min`;
}

export const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  cooking: 'Cooking',
  ready: 'Ready',
  served: 'Served',
};

export const TABLE_LABEL: Record<string, string> = {
  free: 'Free',
  occupied: 'Eating',
  bill_requested: 'Bill asked',
};

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' });
}
