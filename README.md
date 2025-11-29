# OKLCH Palette Generator

A CLI tool for generating perceptually uniform 10-stop color palettes using the OKLCH color space.

[![npm version](https://img.shields.io/npm/v/oklch-palette-generator.svg)](https://www.npmjs.com/package/oklch-palette-generator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-174%20passing-brightgreen.svg)]()
[![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen.svg)]()

<img width="497" alt="OKLCH Palette Generator Demo" src="https://github.com/user-attachments/assets/16a47ef7-646a-4853-8c08-ef3e601e2397" />

## Features

- **Perceptually uniform** - Uses OKLCH color space for consistent lightness/chroma progression
- **Pattern learning** - Extracts transformation patterns from example palettes
- **Multiple modes** - Single, batch, and transformation modes (all combinable)
- **Flexible input** - Any stop position (100-1000) as anchor; supports hex, rgb, hsl, oklch, oklab
- **Multiple exports** - Console, JSON file, or clipboard

## Installation

### Use directly (no install)

```bash
# npm
npx oklch-palette-generator generate

# pnpm
pnpm dlx oklch-palette-generator generate

# yarn
yarn dlx oklch-palette-generator generate

# bun
bunx oklch-palette-generator generate
```

### Install globally

```bash
# npm
npm install -g oklch-palette-generator

# pnpm
pnpm add -g oklch-palette-generator

# yarn
yarn global add oklch-palette-generator

# bun
bun add -g oklch-palette-generator
```

After installing, use `oklch-palette generate` or `oklch-palette-generator generate`.

## Quick Start

### Interactive

```bash
oklch-palette generate
```

### Direct

```bash
# Single palette
oklch-palette generate -c "#2D72D2" -s 500 -f hex -n "blue"

# Batch palettes
oklch-palette generate -c "#2D72D2::500,#DB2C6F::600" -f hex

# Single transformation
oklch-palette generate -c "#2D72D2>#FF6B6B::500" -f hex
```

## Usage

### Modes

| Mode | Syntax | Description |
|------|--------|-------------|
| **Single** | `#2D72D2` | Generate palette from one color |
| **Batch** | `#2D72D2::500,#DB2C6F::600` | Multiple palettes at once |
| **Single Transform** | `#2D72D2>#FF6B6B::500` | Apply ref's appearance to target's hue |
| **One-to-Many Transform** | `#2D72D2>(#FF6B6B,#238551)::500` | Transform ref to multiple targets |
| **Batch Transform** | `#2D72D2>#FF6B6B::500,#48AFF0>#238551::600` | Multiple transformations at once |
| **Batch One-to-Many** | `#2D72D2>(#FF6B6B,#238551)::500,#48AFF0>(#DB2C6F,#FFB366)::600` | Multiple one-to-many transforms |

All modes support comma-separated or multi-line input for batch processing.

### Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--color` | `-c` | Color input (see modes above) | - |
| `--stop` | `-s` | Stop position (100-1000) | 500 |
| `--format` | `-f` | Output format: `hex`, `rgb`, `oklch`, `oklab` | hex |
| `--name` | `-n` | Palette name | - |
| `--export` | `-e` | Export type: `none`, `json`, `clipboard` | none |
| `--path` | `-p` | JSON output path | ./palette.json |

### Stop Positions

| Stop | Description |
|------|-------------|
| 100 | Lightest |
| 500 | Medium (reference) |
| 1000 | Darkest |

## How It Works

1. **Pattern extraction** - Analyzes example palettes to learn lightness/chroma/hue transformations relative to the reference stop (500)
2. **Pattern application** - Applies learned multipliers to generate all 10 stops from your anchor color
3. **Gamut correction** - Clamps colors to displayable sRGB while preserving perceptual characteristics

## Development

```bash
git clone https://github.com/ryannono/oklch-palette-generator
cd oklch-palette-generator
pnpm install

pnpm dev        # Run CLI
pnpm test       # Run tests
pnpm check      # Type check
pnpm build      # Production build
```

**Requirements:** Node.js 18+, pnpm 10.14+

## Tech Stack

- [Effect-ts](https://effect.website/) - Functional TypeScript framework
- [culori](https://culorijs.org/) - Color space conversions
- [@clack/prompts](https://github.com/natemoo-re/clack) - Interactive CLI prompts
- [@effect/cli](https://effect.website/) - Type-safe CLI builder

## License

MIT

---

**Perceptually uniform palettes, type-safe from end to end.**
