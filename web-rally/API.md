# Rally Extension - API Documentation

## Overview

The Rally extension frontend communicates with two main APIs:
- **Rally API** (`/api/rally/v1/`) - Extension-specific endpoints
- **NEI API** (`/api/nei/v1/`) - Main platform endpoints (authentication, users)

## Authentication

All API requests require authentication via JWT tokens. The client automatically:
- Injects the Bearer token in request headers
- Refreshes tokens on 401 errors
- Queues requests during token refresh
- Logs out users on refresh failure

### Token Management

```typescript
import { refreshToken } from '@/services/client';

// Manual token refresh
const token = await refreshToken();
```

## HTTP Client

### `createClient(baseURL?: string)`

Creates an axios client with automatic authentication and error handling.

**Features:**
- Automatic token injection
- Automatic token refresh on 401
- Request queue during refresh
- 5 second timeout

**Example:**
```typescript
import { createClient } from '@/services/client';

const client = createClient('https://api.example.com');
const data = await client.get('/endpoint');
```

## React Hooks

### `useActivities()`

Fetches activities list. Only enabled for managers/admins.

**Returns:** React Query result with activities array

**Example:**
```typescript
const { data: activities, isLoading } = useActivities();
```

### `useCreateActivity()`

Creates a new activity. Invalidates activities cache on success.

**Returns:** React Query mutation

**Example:**
```typescript
const createActivity = useCreateActivity();
createActivity.mutate({
  name: "New Activity",
  activity_type: "GeneralActivity",
  checkpoint_id: 1
});
```

### `useUpdateActivity()`

Updates an existing activity. Invalidates activities cache on success.

**Returns:** React Query mutation

**Example:**
```typescript
const updateActivity = useUpdateActivity();
updateActivity.mutate({
  id: 1,
  activity: { name: "Updated Activity" }
});
```

### `useDeleteActivity()`

Deletes an activity. Invalidates activities cache on success.

**Returns:** React Query mutation

**Example:**
```typescript
const deleteActivity = useDeleteActivity();
deleteActivity.mutate(1); // Delete activity with ID 1
```

### `useUser()`

Fetches current user data and determines admin status.

**Returns:**
- `userData`: User data from API
- `isRallyAdmin`: Boolean indicating admin status
- `isLoading`: Combined loading state
- `userStore`: Access to full user store

**Example:**
```typescript
const { userData, isRallyAdmin, isLoading } = useUser();
```

### `useRallySettings(options?)`

Fetches public Rally settings.

**Parameters:**
- `options.retry`: Retry configuration (boolean or number)

**Returns:** React Query result with settings

**Example:**
```typescript
const { settings, isLoading } = useRallySettings();
```

### `useLoginLink()`

Generates login URL with redirect parameter.

**Returns:** Full login URL string

**Example:**
```typescript
const loginLink = useLoginLink();
// Returns: "https://nei.web.ua.pt/auth/login?redirect_to=..."
```

## Services

### NEIService

Service for NEI platform API endpoints.

#### `getUserById(id: string | number)`

Fetches user data by ID from NEI platform.

**Parameters:**
- `id`: User ID (string or number)

**Returns:** Promise resolving to user data

**Example:**
```typescript
import NEIService from '@/services/NEIService';

const user = await NEIService.getUserById(123);
```

## Generated API Client

The extension uses an auto-generated API client from OpenAPI schema.

**Location:** `src/client/`

**Services:**
- `ActivitiesService` - Activity management
- `CheckPointService` - Checkpoint operations
- `TeamService` - Team management
- `StaffEvaluationService` - Staff evaluation endpoints
- `SettingsService` - Rally settings
- `UserService` - User operations
- `VersusService` - Versus/matchup operations
- `TeamMembersService` - Team member management

All services follow the pattern:
```typescript
import { ActivitiesService } from '@/client';

const activities = await ActivitiesService.getActivitiesApiRallyV1ActivitiesGet();
```

## Error Handling

The HTTP client automatically handles:
- **401 Unauthorized**: Attempts token refresh, retries request
- **Token refresh failure**: Logs out user, rejects request
- **Network errors**: Propagates error to caller
- **Other errors**: Returns error response

## Request/Response Interceptors

### Request Interceptor
- Injects `Authorization: Bearer {token}` header
- Uses token from `useUserStore`

### Response Interceptor
- Extracts `response.data` automatically
- Handles 401 errors with token refresh
- Queues requests during refresh to prevent duplicate calls

## Configuration

API URLs are configured in `src/config/index.ts`:
- `API_NEI_URL`: NEI platform API base URL
- `BASE_URL`: Application base URL

