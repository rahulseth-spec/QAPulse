export function getWeekOfMonth(date: Date): 1 | 2 | 3 | 4 | 5 {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfMonth = date.getDate();
  const firstDayOfWeek = firstDayOfMonth.getDay();
  const weekNum = Math.ceil((dayOfMonth + firstDayOfWeek) / 7);
  return (weekNum > 5 ? 5 : weekNum) as 1 | 2 | 3 | 4 | 5;
}

export function getMonthName(monthNumber: number): string {
  const date = new Date();
  date.setMonth(monthNumber - 1);
  return date.toLocaleString('en-US', { month: 'short' });
}

export function formatISODate(dateStr: string): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

