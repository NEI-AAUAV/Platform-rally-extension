/**
 * Timezone conversion utilities for datetime-local inputs
 * 
 * These functions handle the conversion between:
 * - Local datetime-local format (YYYY-MM-DDTHH:mm) ↔ UTC ISO strings
 * - Ensures consistent timezone handling across the application
 */

/**
 * Converts a local datetime-local string to UTC ISO string
 * 
 * @param value - Local datetime-local string in format YYYY-MM-DDTHH:mm
 * @returns UTC ISO string in format YYYY-MM-DDTHH:mm:ss.sssZ
 * 
 * @example
 * localDatetimeLocalToUTCISOString("2024-01-15T14:30")
 * // Returns: "2024-01-15T13:30:00.000Z" (if in UTC+1 timezone)
 */
export function localDatetimeLocalToUTCISOString(value: string): string {
  // value format: YYYY-MM-DDTHH:mm
  // Parse the datetime-local string and create a Date object in local timezone
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  // Create Date object using constructor with individual parameters
  // This creates a Date object in the local timezone
  const localDate = new Date(year, month - 1, day, hours, minutes);
  
  // The Date object is already in local timezone, so toISOString() converts to UTC
  return localDate.toISOString();
}

/**
 * Converts a UTC ISO string to local datetime-local string
 * 
 * @param utc - UTC ISO string in format YYYY-MM-DDTHH:mm:ss.sssZ
 * @returns Local datetime-local string in format YYYY-MM-DDTHH:mm
 * 
 * @example
 * utcISOStringToLocalDatetimeLocal("2024-01-15T13:30:00.000Z")
 * // Returns: "2024-01-15T14:30" (if in UTC+1 timezone)
 */
export function utcISOStringToLocalDatetimeLocal(utc: string): string {
  // Convert UTC ISO string to local datetime-local string (YYYY-MM-DDTHH:mm)
  const d = new Date(utc);
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Converts a UTC ISO string to a human-readable local time string
 * 
 * @param utc - UTC ISO string
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted local time string
 * 
 * @example
 * utcISOStringToLocalTimeString("2024-01-15T13:30:00.000Z")
 * // Returns: "2:30 PM" (if in UTC+1 timezone)
 */
export function utcISOStringToLocalTimeString(
  utc: string, 
  options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }
): string {
  const d = new Date(utc);
  return d.toLocaleTimeString(undefined, options);
}

/**
 * Converts a UTC ISO string to a human-readable local date string
 * 
 * @param utc - UTC ISO string
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted local date string
 * 
 * @example
 * utcISOStringToLocalDateString("2024-01-15T13:30:00.000Z")
 * // Returns: "1/15/2024" (if in UTC+1 timezone)
 */
export function utcISOStringToLocalDateString(
  utc: string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }
): string {
  const d = new Date(utc);
  return d.toLocaleDateString(undefined, options);
}

/**
 * Converts a UTC ISO string to a human-readable local datetime string
 * 
 * @param utc - UTC ISO string
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted local datetime string
 * 
 * @example
 * utcISOStringToLocalDateTimeString("2024-01-15T13:30:00.000Z")
 * // Returns: "1/15/2024, 2:30 PM" (if in UTC+1 timezone)
 */
export function utcISOStringToLocalDateTimeString(
  utc: string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }
): string {
  const d = new Date(utc);
  return d.toLocaleString(undefined, options);
}

/**
 * Gets the current time in UTC ISO string format
 * 
 * @returns Current UTC time as ISO string
 */
export function getCurrentUTCISOString(): string {
  return new Date().toISOString();
}

/**
 * Gets the current time in local datetime-local format
 * 
 * @returns Current local time as datetime-local string
 */
export function getCurrentLocalDatetimeLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Validates if a string is a valid UTC ISO string
 * 
 * @param str - String to validate
 * @returns True if valid UTC ISO string
 */
export function isValidUTCISOString(str: string): boolean {
  try {
    const d = new Date(str);
    return !isNaN(d.getTime()) && str.includes('Z');
  } catch {
    return false;
  }
}

/**
 * Validates if a string is a valid datetime-local string
 * 
 * @param str - String to validate
 * @returns True if valid datetime-local string
 */
export function isValidDatetimeLocalString(str: string): boolean {
  try {
    const d = new Date(str);
    const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    return !isNaN(d.getTime()) && regex.exec(str) !== null;
  } catch {
    return false;
  }
}
