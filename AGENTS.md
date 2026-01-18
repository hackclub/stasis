# AGENTS.md

## Commands
- `yarn dev` - Start development server
- `yarn build` - Production build (also runs type checking)
- `yarn lint` - Run ESLint
- No test framework configured yet

## Architecture
- **Next.js 16** app with App Router (`app/` directory)
- **React 19** with TypeScript (strict mode)
- **Tailwind CSS v4** for styling with custom theme colors (cream-*, brand-*)
- **GSAP** for animations
- Path alias: `@/*` maps to project root

### Key Components (`app/components/`)
- `PageBorder` - Animated border with Konami code Easter egg
- `NoiseOverlay` - Canvas-based noise effect
- `HoverScramble` - Text scramble animation on hover
- `MagneticCorners` - Magnetic hover effect on corners
- `ASCIIArt` - Mouse-tracking ASCII art reveal
- `AsteroidCat` - Easter egg triggered by Konami code
- `DottedLine` - Decorative dotted line dividers
- `Footer` - Footer with mouse spotlight effect

### Utilities (`lib/`)
- `ascii-art.ts` - ASCII art strings
- `scramble.ts` - useScramble hook for text scramble effect
- `sanitize.ts` - XSS protection utilities using DOMPurify

## Security
- **Input Sanitization**: All user text inputs are sanitized using `sanitize()` from `lib/sanitize.ts` before saving to database
- **CSP Headers**: Content-Security-Policy and security headers are set in `middleware.ts`
- When adding new API routes that accept user input, always sanitize string fields:
  ```typescript
  import { sanitize } from "@/lib/sanitize"
  // Use sanitize() for plain text, sanitizeHtml() if HTML is allowed
  const safeTitle = sanitize(body.title)
  ```

## Code Style
- TypeScript with strict mode enabled
- Client components use `'use client'` directive
- Use `Readonly<>` for component prop types
- Named exports for components (e.g., `export function Component`)
- Tailwind utility classes; custom colors via CSS variables
- GSAP for complex animations; CSS animations for simple ones

DO NOT ai generate migrations, use prisma tools