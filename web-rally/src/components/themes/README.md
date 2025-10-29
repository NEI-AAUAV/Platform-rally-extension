# Rally Theme System

This directory contains the theme system for Rally components, organized to support multiple themes and easy theme switching.

## Structure

```
components/
├── themes/
│   ├── bloody/              # Current "bloody" theme
│   │   ├── button.tsx       # BloodyButton component
│   │   ├── badge.tsx        # BloodyBadge component
│   │   ├── score.tsx        # BloodyScore component
│   │   ├── blood.tsx        # BloodyBlood component
│   │   └── index.ts         # Export all bloody theme components
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

## Adding New Themes

1. Create a new theme folder: `themes/my-theme/`
2. Implement theme components with the same interface as bloody theme
3. Add theme to the `ThemeName` type and `themes` object in `themes/index.ts`
4. Update theme mapping in `ThemeContext.tsx` if needed

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
  'default': 'default',
};
```

## Migration Notes

- All themed components have been moved from root `components/` to `themes/bloody/`
- Theme-agnostic components moved to `shared/`
- Import paths have been updated throughout the codebase
- Direct imports still work for backward compatibility
- Theme context is ready for future theme switching implementation


