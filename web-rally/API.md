# Rally Frontend: API Guide

This document provides an overview of the frontend's interaction with backend APIs, including authentication, data fetching patterns, and client architecture.

## API Endpoints

The frontend consumes two primary APIs, with base URLs configured in `src/config/index.ts`:

-   **Rally API:** Served from `/api/rally/v1`, this provides all extension-specific functionality (e.g., activities, teams, checkpoints).
-   **NEI Platform API:** Served from `/api/nei/v1`, this is used for core platform services like user authentication and profile information.

## Authentication

Authentication is managed automatically by the HTTP client. The `useUserStore` holds the JWT, user profile, and associated scopes. On every request, the client:

1.  Attaches the `Authorization: Bearer <token>` header.
2.  Handles `401 Unauthorized` responses by attempting a single token refresh.
3.  Retries the original request upon successful refresh.
4.  Logs the user out if the token refresh fails.

## Data Fetching with React Query

The recommended method for fetching and mutating data in UI components is via custom React Query hooks. These hooks abstract away the data-fetching logic and provide caching, invalidation, and server state management.

| Hook | Description |
| :--- | :--- |
| `useUser()` | Fetches user profile data from the NEI Platform API. |
| `useRallySettings()` | Fetches public settings for the Rally extension. |
| `useLoginLink()` | Constructs the full NEI login URL with a redirect parameter. |
| `useActivities()` | Fetches the list of all activities. |
| `useCreateActivity()` | Returns a mutation function to create an activity. |
| `useUpdateActivity()` | Returns a mutation function to update an existing activity. |
| `useDeleteActivity()` | Returns a mutation function to delete an activity. |

**Example Usage:**
```typescript
const { data: activities, isLoading } = useActivities();
const createActivity = useCreateActivity();

const handleCreate = () => {
  createActivity.mutate({
    name: 'New Challenge',
    activity_type: 'GeneralActivity',
    checkpoint_id: 1,
  });
};
```
On success, mutation hooks like `useCreateActivity` automatically invalidate the `useActivities` query to refetch the list.

## Generated API Client

For use cases requiring direct, low-level API access outside the standard React component lifecycle, an auto-generated TypeScript client is available.

-   **Location:** `src/client/`
-   **Generation:** The client is generated from the backend's `openapi.json` schema via the `./build-local.sh` script.

**Example Usage:**
```typescript
import { ActivitiesService } from '@/client';

const fetchAllActivities = async () => {
  try {
    const data = await ActivitiesService.getActivitiesApiRallyV1ActivitiesGet();
    return data;
  } catch (error) {
    console.error("Failed to fetch activities:", error);
  }
};
```

## Client Architecture

The core client logic is organized as follows:

-   **`src/services/client.ts`**: Contains the `axios` factory and interceptors that handle authentication and response processing.
-   **`src/services/NEIService.ts`**: Provides a set of helper functions for interacting with common NEI Platform API endpoints.
-   **`src/config/index.ts`**: Centralizes the configuration for API base URLs.
