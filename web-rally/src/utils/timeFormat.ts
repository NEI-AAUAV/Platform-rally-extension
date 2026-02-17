/**
 * Formats a Date object or ISO string to HH:MM format with leading zeros
 * @param date - The Date object or ISO string to format
 * @returns Formatted time string (e.g., "09:05") or "--:--" if date is invalid
 */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) {
    return "--:--";
  }
  
  const dateObj = typeof date === "string" ? new Date(date) : date;
  
  // Validate that dateObj is a valid Date
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return "--:--";
  }
  
  const hours = String(dateObj.getHours()).padStart(2, "0");
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
