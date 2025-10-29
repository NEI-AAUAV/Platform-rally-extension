# Rally Theme System

This directory contains the theme system for Rally components, organized to support multiple themes and easy theme switching.

## Structure

```
components/
├── themes/
│   ├── bloody/              # "Bloody" theme (Halloween - red with liquid effects)
│   │   ├── button.tsx       # BloodyButton component
│   │   ├── badge.tsx        # BloodyBadge component
│   │   ├── score.tsx        # BloodyScore component
│   │   ├── blood.tsx        # BloodyBlood component
│   │   ├── card.tsx         # BloodyCard component
│   │   ├── interactive-card.tsx  # BloodyInteractiveCard component
│   │   ├── background.tsx   # Page background configuration (red gradients)
│   │   └── index.ts         # Export all bloody theme components
│   ├── nei/                 # "NEI" theme (organization black & green)
│   │   ├── button.tsx       # NEIButton component (green, no liquid effect)
│   │   ├── badge.tsx        # NEIBadge component
│   │   ├── score.tsx        # NEIScore component
│   │   ├── card.tsx         # NEICard component
│   │   ├── interactive-card.tsx  # NEIInteractiveCard component
│   │   ├── background.tsx   # Page background configuration (green gradients)
│   │   └── index.ts         # Export all NEI theme components
│   ├── default/             # Future default theme (placeholder)
│   │   └── index.ts
│   ├── index.ts             # Theme selector and exports
│   └── ThemeContext.tsx     # React context for theme management
├── shared/                  # Theme-agnostic components
│   ├── nav-tabs.tsx
│   ├── rally-time-banner.tsx
│   ├── team-image.tsx
│   ├── team.tsx
│   └── index.ts
├── ui/                      # Generic UI components (theme-agnostic)
│   ├── alert.tsx
│   ├── button.tsx
│   ├── card.tsx
│   └── ...
└── index.ts                 # Main component exports
```

## Usage

### Direct Theme Component Import
```tsx
import { BloodyButton } from '@/components/themes/bloody';

function MyComponent() {
  return <BloodyButton>Click me</BloodyButton>;
}
```

### Using Theme Context (Recommended)
```tsx
import { ThemeProvider, useThemedComponents } from '@/components/themes';

function App() {
  return (
    <ThemeProvider>
      <MyComponent />
    </ThemeProvider>
  );
}

function MyComponent() {
  const { Button, Card } = useThemedComponents();
  return (
    <Card variant="default" padding="lg">
      <h2>Content</h2>
      <Button>Click me</Button>
    </Card>
  );
}
```

### Using Themed Cards
```tsx
function StaffPage() {
  const { Card, InteractiveCard } = useThemedComponents();
  
  return (
    <div>
      {/* Main content card */}
      <Card variant="default" padding="lg">
        <h2>Teams</h2>
      </Card>
      
      {/* Clickable team cards */}
      {teams.map((team) => (
        <InteractiveCard
          key={team.id}
          status="success"
          onClick={() => selectTeam(team)}
          selected={selectedId === team.id}
        >
          <h4>{team.name}</h4>
        </InteractiveCard>
      ))}
    </div>
  );
}
```

### Shared Components
```tsx
import { NavTabs, RallyTimeBanner } from '@/components/shared';

function Layout() {
  return (
    <div>
      <RallyTimeBanner />
      <NavTabs />
    </div>
  );
}
```

## Available Themes

### 1. Bloody Theme (Halloween)
Dark, intense styling with red accents for Halloween/horror-themed rally events.
- **Colors**: Dark backgrounds with white text and red accents
- **Special effects**: Liquid/blood drip animation on buttons (using `blood` prop)
- **Button**: Red `bg-[#dc2625]` with optional blood effect
- **Background**: Red radial gradients
- **Use case**: Halloween-themed events with spooky atmosphere

### 2. NEI Theme
Clean, professional styling with NEI organization branding.
- **Colors**: Same dark backgrounds as bloody theme but with NEI brand green accents
- **Brand color**: `#008542` (NEI logo green) - darker, richer green
- **Special effects**: None - clean, modern design without liquid effects
- **Button**: NEI green `bg-[#008542]` with darker hover `bg-[#006633]`
- **Background**: NEI green radial gradients `rgba(0,133,66,0.12)`
- **Border accents**: NEI green (`#008542`) with various opacity levels instead of red
- **Use case**: Official NEI-branded rally events
- **Components**: Full theme implementation (Button, Badge, Score, Card, InteractiveCard, background)

### 3. Default Theme
Fallback theme (currently uses Bloody theme components).

## Adding New Themes

1. Create a new theme folder: `themes/my-theme/`
2. Implement theme components with the same interface:
   - Required: `Card`, `InteractiveCard`
   - Optional: `Button`, `Badge`, `Score`, `Blood`
3. Add theme to the `ThemeName` type and `themes` object in `themes/index.ts`
4. Update theme mapping in `ThemeContext.tsx` to associate the theme with rally settings

## Theme Components Interface

All theme components should implement the same interface:

```tsx
interface ThemeComponents {
  Button: React.ComponentType<any>;
  Badge: React.ComponentType<any>;
  Score: React.ComponentType<any>;
  Blood: React.ComponentType<any>;
  Card: React.ComponentType<any>;
  InteractiveCard: React.ComponentType<any>;
}
```

### Card Components

The theme system now includes card components for consistent styling across different rally events:

- **Card**: Standard card container with variants (default, elevated, subtle, nested)
- **InteractiveCard**: Clickable cards with status indicators (success, warning, info, etc.)

## Theme Selection

Themes are automatically selected based on the `rally_theme` setting from Rally settings. The mapping is defined in `ThemeContext.tsx`:

```tsx
const themeMapping: Record<string, ThemeName> = {
  'Rally Tascas': 'bloody',
  'bloody': 'bloody',
  'NEI Rally': 'nei',
  'nei': 'nei',
  'default': 'default',
};
```

To use a specific theme, set the `rally_theme` in Rally settings to one of:
- `'Rally Tascas'` or `'bloody'` → Bloody theme
- `'NEI Rally'` or `'nei'` → NEI theme (black & green)
- `'default'` → Default theme

## Migration Notes

- All themed components have been moved from root `components/` to `themes/bloody/`
- Theme-agnostic components moved to `shared/`
- Import paths have been updated throughout the codebase
- Direct imports still work for backward compatibility
- Theme context is ready for future theme switching implementation


