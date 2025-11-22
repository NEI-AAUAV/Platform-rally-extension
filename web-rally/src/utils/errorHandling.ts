/**
 * Utility functions for error handling
 */

/**
 * Extracts a user-friendly error message from various error types
 * 
 * Handles different error formats:
 * - API errors with body.detail
 * - Axios errors with response.data.detail
 * - Standard Error objects with message
 * 
 * @param error - The error object (unknown type for flexibility)
 * @param fallback - Fallback message if error format is unknown
 * @returns User-friendly error message
 * 
 * @example
 * ```tsx
 * try {
 *   await someApiCall();
 * } catch (error) {
 *   const message = getErrorMessage(error, "Something went wrong");
 *   toast.error(message);
 * }
 * ```
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    body?: { detail?: string };
    response?: { data?: { detail?: string } };
    message?: string;
  };

  // Try body.detail (some API error formats)
  if (typeof candidate.body?.detail === "string") {
    return candidate.body.detail;
  }

  // Try response.data.detail (Axios error format)
  if (typeof candidate.response?.data?.detail === "string") {
    return candidate.response.data.detail;
  }

  // Try standard error message
  if (typeof candidate.message === "string" && candidate.message.length > 0) {
    return candidate.message;
  }

  return fallback;
}

