# Platform Rally Extension

### Key Features

- **Team Management**: Create, update, and track teams with member assignments
- **Checkpoint System**: Define and manage rally checkpoints with scoring
- **Real-time Scoring**: Live scoreboard with team rankings and progress tracking
- **Staff Interface**: Administrative tools for checkpoint staff to record team progress
- **Participant Interface**: Team-specific views and progress tracking
- **Authentication**: Integrated with NEI Platform authentication system
- **Responsive Design**: Modern UI built with React and Tailwind CSS

## 🏗️ Architecture

The extension consists of two main components:

### Backend (`api-rally`)
- **Framework**: FastAPI with Python 3.10+
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Authentication**: JWT-based authentication integrated with NEI Platform
- **API**: RESTful API with automatic OpenAPI documentation

### Frontend (`web-rally`)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom components
- **State Management**: Zustand + TanStack Query
- **Routing**: React Router v6

## 📁 Project Structure

```
Platform-rally-extension/
├── api-rally/                 # Backend API service
│   ├── app/
│   │   ├── api/              # API routes and endpoints
│   │   ├── core/             # Configuration and logging
│   │   ├── crud/             # Database operations
│   │   ├── db/               # Database models and setup
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   └── tests/            # Test suite
│   ├── Dockerfile            # Development container
│   ├── Dockerfile.prod       # Production container
│   └── pyproject.toml        # Python dependencies
├── web-rally/                # Frontend application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Application pages
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API client services
│   │   ├── stores/           # State management
│   │   └── client/           # Auto-generated API client
│   ├── public/               # Static assets
│   ├── Dockerfile            # Development container
│   ├── Dockerfile.prod       # Production container
│   └── package.json          # Node.js dependencies
├── compose.override.yml       # Development Docker Compose
├── compose.override.prod.yml  # Production Docker Compose
└── platform-rally.code-workspace  # VS Code workspace
```

## 🎮 Usage

### For Participants

1. **View Scoreboard**: See real-time team rankings and scores
2. **Team Details**: View your team's progress and checkpoint history
3. **Maps**: Access rally maps and checkpoint locations

### For Staff

1. **Admin Panel**: Access administrative functions (admin users only)
2. **Checkpoint Management**: Record team progress at assigned checkpoints
3. **Team Management**: Create and manage teams and participants

### For Administrators

1. **Full System Access**: Complete control over teams, checkpoints, and scoring
2. **User Management**: Manage staff and participant accounts
3. **System Configuration**: Configure rally parameters and settings

## 🗄️ Database Schema

### Core Entities

- **Teams**: Rally teams with scoring and classification data
- **Users**: System users (admins, staff, participants)
- **Checkpoints**: Rally checkpoints with descriptions and locations

### Key Relationships

- Users belong to Teams (participants)
- Users can be assigned to Checkpoints (staff)
- Teams have multiple checkpoint times and scores
- Teams are classified based on total scores

## 🔧 Configuration

### Environment Variables

#### Backend (`api-rally`)
- `POSTGRES_SERVER`: Database server hostname
- `POSTGRES_PASSWORD`: Database password
- `JWT_PUBLIC_KEY_PATH`: Path to JWT public key
- `ENV`: Environment (development/production)

#### Frontend (`web-rally`)
- `VITE_API_URL`: Backend API URL
- `VITE_NEI_API_URL`: NEI Platform API URL

### Docker Configuration

The extension includes both development and production Docker configurations:

- **Development**: Hot reloading, volume mounts, debug logging
- **Production**: Optimized builds, multi-stage builds, security hardening

## 🧪 Testing

### Backend Testing
```bash
cd api-rally
poetry install
poetry run pytest
```

### Frontend Testing
```bash
cd web-rally
npm install
npm run test
```

## 📊 API Endpoints

### Teams
- `GET /api/v1/team/` - List all teams
- `GET /api/v1/team/me` - Get current user's team
- `GET /api/v1/team/{id}` - Get team by ID
- `POST /api/v1/team/` - Create new team (admin)
- `PUT /api/v1/team/{id}` - Update team (admin)
- `PUT /api/v1/team/{id}/checkpoint` - Add checkpoint score (staff)

### Checkpoints
- `GET /api/v1/checkpoint/` - List all checkpoints
- `GET /api/v1/checkpoint/me` - Get next checkpoint for team
- `GET /api/v1/checkpoint/teams` - Get teams for checkpoint (staff)

### Users
- `GET /api/v1/user/me` - Get current user info
- `PUT /api/v1/user/me` - Update current user

## 🎨 UI Components

### Custom Components
- **BloodyButton**: Themed button component with blood effect
- **Score**: Team score display component
- **Team**: Team card component
- **CustomBadge**: Styled badge component

### Pages
- **Scoreboard**: Real-time team rankings
- **Teams**: Team listing and details
- **Maps**: Rally maps and checkpoint locations
- **Admin**: Administrative interface

## 🔐 Security

- JWT-based authentication
- Role-based access control (admin, staff, participant)
- CORS configuration
- Input validation with Pydantic schemas
- SQL injection protection with SQLAlchemy ORM

## 🚀 Deployment

### Docker Images
- Backend: `ghcr.io/nei-aauav/api-rally:latest`
- Frontend: `ghcr.io/nei-aauav/web-rally:latest`

### Nginx Configuration
The extension includes Nginx configuration for:
- Reverse proxy setup
- Static file serving
- SSL termination (production)
- Load balancing