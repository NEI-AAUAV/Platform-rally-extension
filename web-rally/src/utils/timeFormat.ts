/**
 * Formats a Date object to HH:MM format with leading zeros
 * @param date - The Date object to format
 * @returns Formatted time string (e.g., "09:05")
 */
export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
