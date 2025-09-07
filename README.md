# Rally Tascas Extension

A comprehensive drinking game management system for NEI's "Rally Tascas" - a competitive team-based drinking game where teams visit checkpoints, complete drinking challenges, and earn points. This extension provides real-time scoring, team management, and checkpoint tracking for the ultimate drinking rally experience.

## 🍻 What is Rally Tascas?

Rally Tascas is a competitive drinking game where teams navigate through various checkpoints across campus, completing drinking challenges and earning points. Teams compete for the highest score through a combination of drinking performance, time completion, and challenge success.

### Key Features

- **Team Management**: Create, update, and track drinking teams with member assignments
- **Checkpoint System**: 8 themed checkpoints with unique drinking challenges and scoring
- **Real-time Scoring**: Live scoreboard with team rankings and drinking performance tracking
- **Staff Interface**: Checkpoint staff can record team drinking performance and challenge completion
- **Participant Interface**: Team-specific views showing drinking progress and checkpoint history
- **Drinking Metrics**: Track shots, pukes, drinking participation, and challenge completion
- **Authentication**: Integrated with NEI Platform authentication system
- **Responsive Design**: Modern UI built with React and Tailwind CSS with "bloody" theme

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

### For Participants (Drinking Teams)

1. **View Scoreboard**: See real-time team rankings and drinking performance scores
2. **Team Details**: View your team's drinking progress and checkpoint completion history
3. **Maps**: Access rally maps showing drinking checkpoint locations across campus
4. **Checkpoint Info**: View next checkpoint details and drinking challenges

### For Checkpoint Staff

1. **Checkpoint Management**: Record team drinking performance at assigned checkpoints
2. **Scoring Interface**: Input shots consumed, pukes, drinking participation, and challenge completion
3. **Team Verification**: Verify team identity and drinking performance
4. **Real-time Updates**: Update team scores and checkpoint completion status

### For Administrators

1. **Full System Access**: Complete control over teams, checkpoints, and drinking game scoring
2. **User Management**: Manage staff and participant accounts
3. **Game Configuration**: Configure rally parameters, checkpoint challenges, and scoring rules
4. **Team Management**: Create and manage drinking teams and member assignments

## 🗄️ Database Schema

### Core Entities

- **Teams**: Drinking teams with scoring and classification data (12 teams total)
- **Users**: System users (admins, checkpoint staff, drinking participants)
- **Checkpoints**: 8 themed drinking checkpoints with creative names and challenges

### Drinking Game Checkpoints

1. **Tribunal** (Mugshot) - AFUAv location
2. **Receção** (Algemas) - Dep. Materiais
3. **Cela** (Até andas de lado) - Tunnel between DETI and DEP
4. **Pátio** (Palmada) - Fotossíntese
5. **Cantina** (Hot Wheels) - Dep. Matemática
6. **WC** (Sabonetes) - Restaurante Universitário (Grelhados)
7. **Ginásio** (MotoMoto) - Pavilhão Arístides
8. **Enfermaria** (SpEIderSémen) - Bridge entrance at Crasto

### Key Relationships

- Users belong to Teams (drinking participants)
- Users can be assigned to Checkpoints (checkpoint staff)
- Teams have multiple checkpoint times and drinking performance scores
- Teams are classified based on total drinking game scores

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
- `GET /api/v1/team/` - List all drinking teams
- `GET /api/v1/team/me` - Get current user's drinking team
- `GET /api/v1/team/{id}` - Get team by ID
- `POST /api/v1/team/` - Create new drinking team (admin)
- `PUT /api/v1/team/{id}` - Update team (admin)
- `PUT /api/v1/team/{id}/checkpoint` - Record drinking performance at checkpoint (staff)

### Checkpoints
- `GET /api/v1/checkpoint/` - List all drinking checkpoints
- `GET /api/v1/checkpoint/me` - Get next checkpoint for team
- `GET /api/v1/checkpoint/teams` - Get teams for specific checkpoint (staff)

### Users
- `GET /api/v1/user/me` - Get current user info
- `PUT /api/v1/user/me` - Update current user

## 🎨 UI Components

### Custom Components
- **BloodyButton**: Themed button component with blood effect (perfect for drinking game theme!)
- **Score**: Team drinking performance score display component
- **Team**: Drinking team card component
- **CustomBadge**: Styled badge component for team status

### Pages
- **Scoreboard**: Real-time drinking team rankings and performance
- **Teams**: Drinking team listing and performance details
- **Maps**: Rally maps showing drinking checkpoint locations across campus
- **Admin**: Administrative interface for drinking game management

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