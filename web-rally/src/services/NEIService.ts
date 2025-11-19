import config from "@/config";
import { createClient } from "./client";

const client = createClient(`${config.BASE_URL}/api/nei/v1`);

/**
 * Service for interacting with NEI platform API endpoints
 * 
 * Provides methods to fetch data from the main NEI platform API.
 * All requests include automatic authentication and error handling.
 */
const NEIService = {
  /**
   * Fetches user data by ID from NEI platform
   * 
   * @param id - User ID (string or number)
   * @returns Promise resolving to user data
   * 
   * @example
   * ```ts
   * const user = await NEIService.getUserById(123);
   * ```
   */
  getUserById: async (id: string | number) => {
    const response = await client.get(`/user/${id}`);
    return response;
  },
};

export default NEIService;
