---
name: SwachhLens
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3e4a3d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6e7b6c'
  outline-variant: '#bdcaba'
  surface-tint: '#006e2d'
  primary: '#006b2c'
  on-primary: '#ffffff'
  primary-container: '#00873a'
  on-primary-container: '#f7fff2'
  inverse-primary: '#62df7d'
  secondary: '#00687a'
  on-secondary: '#ffffff'
  secondary-container: '#57dffe'
  on-secondary-container: '#006172'
  tertiary: '#515c71'
  on-tertiary: '#ffffff'
  tertiary-container: '#6a758a'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#7ffc97'
  primary-fixed-dim: '#62df7d'
  on-primary-fixed: '#002109'
  on-primary-fixed-variant: '#005320'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#d8e3fb'
  tertiary-fixed-dim: '#bcc7de'
  on-tertiary-fixed: '#111c2d'
  on-tertiary-fixed-variant: '#3c475a'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display:
    fontFamily: Manrope
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  title-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  margin-mobile: 16px
  margin-desktop: 48px
  gutter: 16px
---

## Brand & Style
The design system is a high-performance civic-tech framework designed for field-readiness and civic engagement. It blends **Modern Corporate** reliability with **Minimalist** efficiency to ensure the AI-powered capabilities feel like a seamless extension of the user's workflow.

The aesthetic is governed by high-clarity interfaces that prioritize information density and legibility under varying outdoor lighting conditions. By utilizing professional finishes, the system evokes a sense of governmental authority paired with startup-level innovation, ensuring that waste management professionals and citizens alike feel empowered by a tool that is both high-tech and inherently practical.

## Colors
The palette is rooted in **Environmental Green**, symbolizing cleanliness and growth, paired with **AI Cyan** to highlight intelligent features such as object recognition and automated routing. 

- **Primary & Secondary:** Use #16A34A for main actions and brand presence. Reserve #06B6D4 for AI-driven insights, scan animations, and data visualization.
- **Surface & Background:** The background uses a cool #F8FAFC to reduce glare, while #FFFFFF is reserved for interactive cards and elevated surfaces.
- **High-Contrast Text:** Primary text adheres to a strict dark charcoal (#1E293B) to ensure a high contrast ratio (7:1+) against light surfaces for maximum readability in sunlight.
- **Severity Scale:** Used for waste categorization and urgency levels, ensuring a logical progression from success/low to critical alerts.

## Typography
This design system utilizes **Manrope** for its modern, geometric construction that maintains exceptional legibility at small sizes. 

- **Hierarchy:** Use bold weights for headlines to create a clear scan path. 
- **Accessibility:** Body text must never drop below 16px to ensure accessibility for field workers. 
- **Numerical Data:** For AI confidence scores and waste weights, use `label-md` or `title-md` with semi-bold weights to ensure data points are the focal point of reports.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a 4px baseline rhythm.

- **Mobile First:** Given the nature of waste reporting, the 4-column mobile grid is the primary focus. Standard horizontal margins are 16px.
- **Touch Targets:** All interactive elements must maintain a minimum hit area of 44x44px. 
- **Containers:** Content is organized in full-width or inset cards. Use `lg` (24px) spacing for vertical section separation to prevent visual clutter in data-heavy screens.

## Elevation & Depth
This design system uses **Tonal Layers** and **Ambient Shadows** to create a structured hierarchy that mimics native OS environments.

- **Level 0 (Background):** #F8FAFC. For the main canvas.
- **Level 1 (Cards/Surfaces):** #FFFFFF with a subtle 1px border (#E2E8F0) and a soft, diffused shadow: `0px 4px 6px -1px rgba(0, 0, 0, 0.05)`.
- **Level 2 (Floating/Active):** Reserved for active inputs or floating action buttons (FABs). Uses a more pronounced shadow: `0px 10px 15px -3px rgba(0, 0, 0, 0.1)`.
- **AI Layers:** Elements identified by AI should use a secondary cyan outer glow to signify "active intelligence" or scanning states.

## Shapes
The design system employs a **Rounded** shape language to feel approachable and modern. 

- **Standard Elements:** Buttons, input fields, and small chips use 0.5rem (8px).
- **Large Components:** Main content cards and bottom sheets use `rounded-lg` (16px) to align with modern mobile OS patterns.
- **Icons:** Should follow a consistent 2px stroke width with slightly rounded terminals to match the typography.

## Components
- **Buttons:** Primary buttons use a solid #16A34A background with white text. AI-specific actions (e.g., "Scan Waste") utilize a gradient from #16A34A to #06B6D4.
- **Chips:** Used for waste categories (e.g., Plastic, Organic). Use a light tinted background of the severity color with dark text for high legibility.
- **Input Fields:** Use #FFFFFF background with a 1px #E2E8F0 border. On focus, the border shifts to the primary green with a 2px outer glow.
- **Cards:** The central container for all reports. Must include a clear "Severity Badge" in the top right and a primary action button at the bottom.
- **Camera Interface:** A specialized component featuring a cyan "AI Targeting" reticle and real-time classification labels using `label-sm` on a semi-transparent dark background.
- **Lists:** High-density rows with 16px padding, utilizing chevron-right icons to indicate drill-down capabilities.