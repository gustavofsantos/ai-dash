---
name: Core Engineering System v2
themes:
  light:
    surface: '#FFFFFF'
    surface-dim: '#F5F5F5'
    surface-container: '#FAFAFA'
    on-surface: '#1A1A1A'
    on-surface-variant: '#666666'
    outline: '#E0E0E0'
    primary: '#0052FF' # Precision Blue
    secondary: '#6B7280'
    tertiary: '#10B981' # Success Green
    error: '#EF4444'
    background: '#FFFFFF'
  dark:
    surface: '#0A0A0A'
    surface-dim: '#121212'
    surface-container: '#1A1A1A'
    on-surface: '#F2F2F2'
    on-surface-variant: '#A1A1AA'
    outline: '#27272A'
    primary: '#3B82F6' 
    secondary: '#94A3B8'
    tertiary: '#22C55E'
    error: '#F87171'
    background: '#050505'
typography:
  headline:
    fontFamily: Space Grotesk
    weight: 500
    letterSpacing: -0.02em
  body:
    fontFamily: Inter
    weight: 400
    size: 14px
  mono:
    fontFamily: JetBrains Mono # Optimized for code clarity
    size: 13px
rounded:
  none: 0px
  sm: 2px
  default: 4px
---

## Brand & Style: "Minimalist Precision"

The personality has evolved from "Functional Intelligence" to **"Minimalist Precision."** It removes all unnecessary visual weight—shadows, glows, and gradients—leaving only what is required for the user to parse complex data. 

- **Achromatic Core:** The system is primarily grayscale. Color is used strictly as a signaling mechanism (status, action, or error), never for decoration.
- **The "Paper" Philosophy:** In Light Mode, the UI should feel like high-quality technical stationery. In Dark Mode, it should feel like a low-emission terminal.

## Dual-Theme Strategy

### Light Mode (The Laboratory)
Optimized for daytime focus and high-glare environments. It uses a high-contrast ratio with `#FFFFFF` backgrounds and `#1A1A1A` text. Borders are kept at a faint `#E0E0E0` to define containers without cluttering the eye.

### Dark Mode (The Observatory)
Optimized for long-duration deep work. It avoids pure "OLED Black" for main surfaces to prevent smearing, using a deeply desaturated `#0A0A0A` instead. UI elements are separated by thin, low-contrast borders.

## Typography

We utilize a "Type as Architecture" approach:
- **Space Grotesk:** Reserved for structural elements (Headers, Page Titles, Tab Labels). Its geometric nature provides the "engineered" aesthetic.
- **Inter:** The workhorse for all UI controls, body text, and descriptions. 
- **JetBrains Mono:** Switched from Space Grotesk for code to improve legibility of characters like `0` vs `O` and `l` vs `1`.

## Layout & Minimalist Spacing

The layout remains a 12-column fluid grid, but with "Airy Density." We maintain a high information density while using a strict 8px (2-unit) padding rule to ensure elements never feel "cramped."

- **Borders over Backgrounds:** To keep the layout "light," use `1px` borders to define sections rather than alternating background colors.
- **Sidebar:** Reduced to 200px. It should be semi-transparent or use the `surface-dim` color to recede behind the main workspace.

## Component Refinement

### Buttons
- **Primary:** Solid `on-surface` background with `surface` text (High contrast).
- **Secondary/Ghost:** `1px outline` with no background fill. 
- **Interaction:** On hover, buttons should simply shift opacity (e.g., 100% to 80%) rather than changing color or adding shadows.

### Cards & Containers
Cards no longer use shadows. They are defined by a `1px` border. In Light Mode, use a subtle `surface-container` fill; in Dark Mode, use a `surface-dim` fill.

### Data Visualization
- **Stroke Weight:** All chart lines are fixed at `1.5px`.
- **Minimalist Axes:** Remove grid lines where possible. Only show X and Y axis lines if strictly necessary for reading values. 
- **Interaction:** Tooltips should be plain rectangles with `0px` border-radius and `headline` typography for values.

### Status Indicators
No longer use "pills" or large chips. Use a **Simple Dot** (4px) next to a `label-caps` text string.
- `● Running` (Tertiary)
- `● Stopped` (Secondary)
- `● Failed` (Error)
