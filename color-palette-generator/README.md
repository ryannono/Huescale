# Color Palette Generator

> A CLI tool for generating perceptually uniform color palettes using OKLCH color space and Effect-ts functional programming.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Effect-ts](https://img.shields.io/badge/Effect--ts-3.19-purple.svg)](https://effect.website/)
[![Tests](https://img.shields.io/badge/tests-174%20passing-brightgreen.svg)]()
[![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen.svg)]()

## Overview

Color Palette Generator is a sophisticated CLI tool that generates complete 10-stop color palettes (100-1000) from a single color input. It uses machine learning-inspired pattern extraction to ensure consistent, perceptually uniform color progressions across all palette stops.

### Key Features

- **Perceptually Uniform**: Uses OKLCH color space for consistent lightness and chroma progression
- **Pattern Learning**: Extracts and applies transformation patterns from example palettes
- **Multiple Execution Modes**:
  - Single palette generation
  - Batch palette generation (multiple colors at once)
  - Color transformations (apply one color's optical properties to another's hue)
  - One-to-many transformations (apply to multiple target colors)
- **Flexible Input**: Any stop position (100-1000) as anchor point
- **Multiple Output Formats**: hex, rgb, oklch, oklab
- **Export Options**: JSON file or clipboard
- **Type-Safe**: Built with Effect-ts for comprehensive compile-time and runtime validation
- **Interactive & Direct Modes**: Auto-detection with error recovery

## Installation

```bash
# Clone repository
git clone <repository-url>
cd color-palette-generator

# Install dependencies (requires pnpm)
pnpm install

# Run CLI in development
pnpm dev

# Build for production
pnpm build
```

### Requirements

- Node.js 18+
- pnpm 10.14+

## Quick Start

### Interactive Mode

Run without arguments for interactive prompts:

```bash
pnpm dev
```

You'll be guided through:
1. Input mode selection (single, batch, or transform)
2. Color input
3. Stop position (which stop your color represents)
4. Output format
5. Export options

### Direct Mode

Provide all options via CLI flags:

```bash
# Generate palette from color at stop 500
pnpm dev --color "#2D72D2" --stop 500 --format hex --name "blue-palette"

# Short flags
pnpm dev -c 2D72D2 -s 700 -f oklch -n "dark-blue"

# Export to JSON
pnpm dev -c "#2D72D2" -s 500 -f hex --export json --path ./output/palette.json

# Copy to clipboard
pnpm dev -c "#2D72D2" -s 500 -f hex --export clipboard
```

### Batch Mode

Generate multiple palettes at once:

```bash
# Comma-separated (color::stop pairs)
pnpm dev -c "#2D72D2::500,#163F79::700" -f hex

# Multi-line input (interactive paste mode)
pnpm dev
# Select "Paste multiple colors"
# Enter:
# #2D72D2::500
# #163F79::700
# #48AFF0::300
```

### Color Transformation Mode

Apply the optical appearance (lightness + chroma) from one color to another color's hue:

```bash
# Single transformation: ref>target::stop
pnpm dev -c "#2D72D2>#FF6B6B::500" -f hex

# One-to-many: ref>(target1,target2,target3)::stop
pnpm dev -c "#2D72D2>(#FF6B6B,#238551,#FFB366)::500" -f hex

# Batch transformations (comma or newline separated)
pnpm dev -c "#2D72D2>#FF6B6B::500,#48AFF0>#238551::600" -f hex
```

## Usage Details

### Color Input Formats

Supports any format parseable by [culori](https://culorijs.org/):

- **Hex**: `#2D72D2` or `2D72D2` (# is optional)
- **RGB**: `rgb(45, 114, 210)`
- **HSL**: `hsl(214, 65%, 50%)`
- **OKLCH**: `oklch(57% 0.15 259)`
- **OKLAB**: `oklab(57% -0.05 -0.14)`
- And more...

### Stop Positions

Valid stop positions: **100, 200, 300, 400, 500, 600, 700, 800, 900, 1000**

- 100: Lightest
- 500: Medium (typically used as reference)
- 1000: Almost black

Your input color can represent any stop. The generator will create the other 9 stops using learned transformation patterns.

### Output Formats

- `hex`: `#2d72d2`
- `rgb`: `rgb(45, 114, 210)`
- `oklch`: `oklch(57.23% 0.154 258.7)`
- `oklab`: `oklab(57.23% -0.051 -0.144)`

### Export Options

- `none`: Display only (no export)
- `clipboard`: Copy JSON to clipboard
- `json`: Save to file (prompts for path if not provided)

## Architecture

### Technology Stack

- **Effect-ts v3.19+**: Functional programming with type-safe services and error handling
- **@effect/schema**: Runtime validation that matches TypeScript types
- **@effect/cli**: Type-safe command-line interface
- **@effect/platform**: Cross-platform FileSystem and Path services
- **culori**: Color space conversions and parsing
- **@clack/prompts**: Beautiful interactive CLI prompts


### How It Works

#### 1. Pattern Learning

The generator analyzes example palettes to learn transformation rules:

```typescript
// For each stop, calculate relative transformations from reference (500)
// Example: If 100 has L=0.95 and 500 has L=0.55:
//   lightnessMultiplier[100] = 0.95 / 0.55 = 1.727

interface StopTransform {
  lightnessMultiplier: number  // Multiply reference L by this
  chromaMultiplier: number     // Multiply reference C by this
  hueShiftDegrees: number      // Add this to reference H
}
```

Pattern extraction allows:
- Learning from real-world palettes
- Consistent transformations across all stops
- Flexibility to adapt to different design systems
- Mathematical smoothing for perceptual uniformity
  

#### 2. Pattern Application

Given an anchor color at any stop, apply relative transformations:

```typescript
// If anchor is blue (#2D72D2) at stop 400:
// To generate stop 100, apply: transform[100] / transform[400]
// relativeLightness = 1.727 / 1.182 = 1.461
// newL = anchorL × 1.461
```

#### 3. Gamut Correction

Colors are automatically clamped to displayable sRGB gamut while preserving perceptual characteristics.

#### 4. Color Transformation

Apply optical appearance from reference to target:

```typescript
// reference = #2D72D2 (blue)
// target = #FF6B6B (red)
// Result: Red hue with blue's lightness and chroma
// Creates perceptually similar colors across different hues
```

## Development

### Scripts

```bash
# Development
pnpm dev                 # Run CLI in dev mode
pnpm check              # Type check

# Testing
pnpm test               # Run tests
pnpm coverage           # Generate coverage report

# Build
pnpm build              # Full production build
pnpm build-esm          # TypeScript compilation
pnpm build-cjs          # CommonJS transformation
pnpm build-annotate     # Pure call annotations

# Quality
pnpm lint               # Run ESLint
pnpm lint-fix           # Fix linting issues
```

### Testing

Comprehensive test suite with **174 passing tests** and **95% coverage**:

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test --watch

# Coverage report
pnpm coverage
```

## License

MIT

## Acknowledgments

- [Effect-ts](https://effect.website/) - Functional TypeScript framework
- [culori](https://culorijs.org/) - Color space conversions
- [Björn Ottosson](https://bottosson.github.io/posts/oklab/) - OKLCH/OKLAB color space
- [clack](https://github.com/natemoo-re/clack) - Beautiful CLI prompts

---

**Built with Effect-ts** | **Perceptually uniform palettes** | **Type-safe from end to end**
