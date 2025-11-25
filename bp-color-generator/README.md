# BP Color Palette Generator

Generate perceptually uniform 10-stop color palettes in OKLCH color space using Effect-ts.

## Features

- **OKLCH Color Space**: Generates palettes in perceptually uniform OKLCH space for consistent lightness and chroma progression
- **Pattern Learning**: Learns transformation patterns from example palettes to generate new palettes with similar characteristics
- **Multiple Output Formats**: Supports hex, rgb, oklch, and oklab output formats
- **Smart CLI**: Automatic detection between direct and interactive modes with error recovery
- **Type-Safe**: Built with Effect-ts for comprehensive type safety and error handling
- **Flexible Anchor Stops**: Generate palettes from any stop position (100-1000)

## Installation

```sh
pnpm install
```

## Usage

The CLI has a single `generate` command that works in both interactive and direct modes.

### Interactive Mode

Run without arguments to enter interactive mode with prompts:

```sh
pnpm dev
# or
npx tsx src/cli/index.ts generate
```

You'll be prompted for:
- Input color (hex, rgb(), oklch(), etc.)
- Stop position (100-1000) that represents your input color
- Output format (hex, rgb, oklch, oklab)
- Palette name (optional)

### Direct Mode

Provide all options via CLI flags:

```sh
pnpm dev --color "#2D72D2" --stop 500 --format hex --name "my-blue"
# or
npx tsx src/cli/index.ts generate --color "#2D72D2" --stop 500 --format hex --name "my-blue"
```

**Short flags:**
```sh
pnpm dev -c 2D72D2 -s 500 -f oklch -n "my-blue"
```

### Error Recovery

Invalid options automatically trigger interactive prompts:

```sh
# Invalid color triggers re-prompt
pnpm dev --color "invalid" --stop 500
```

## Examples

### Generate blue palette from hex color

```sh
pnpm dev -c "#2D72D2" -s 500 -f hex
```

### Generate palette in OKLCH format from darker stop

```sh
pnpm dev -c "#163F79" -s 700 -f oklch
```

### Generate with custom name

```sh
pnpm dev -c "rgb(45, 114, 210)" -s 500 -f rgb -n "Blueprint Blue"
```

## Color Input Formats

Supports any format that [culori](https://culorijs.org/) can parse:

- **Hex**: `#2D72D2` or `2D72D2` (# is optional)
- **RGB**: `rgb(45, 114, 210)`
- **HSL**: `hsl(214, 65%, 50%)`
- **OKLCH**: `oklch(57% 0.15 259)`
- **And many more...**

## Output Formats

- `hex` - Hexadecimal: `#2d72d2`
- `rgb` - RGB: `rgb(45, 114, 210)`
- `oklch` - OKLCH: `oklch(57.23% 0.154 258.7)`
- `oklab` - OKLAB: `oklab(57.23% -0.051 -0.144)`

## Development

**Run CLI:**
```sh
pnpm dev
```

**Run tests:**
```sh
pnpm test
```

**Build package:**
```sh
pnpm build
```

**Type check:**
```sh
pnpm check
```

**Lint:**
```sh
pnpm lint
pnpm lint-fix
```

## Architecture

### Service-Based Architecture (Effect-ts v3.9+)

Built using modern **Effect.Service** pattern for clean dependency injection:

**Core Services:**
- **ConfigService** - App configuration (pattern paths, defaults)
- **PatternService** - Load/extract color transformation patterns
- **PaletteService** - Generate palettes from colors and patterns
- **ExportService** - Output to JSON/clipboard

**Layer Composition:**
```typescript
// Production
const MainLive = Layer.mergeAll(
  ConfigService.Default,
  PatternService.Default,
  ExportService.Default,
  PaletteService.Default
)

// Usage
Effect.gen(function*() {
  const service = yield* PaletteService
  const palette = yield* service.generate({ inputColor: "#2D72D2", anchorStop: 500 })
}).pipe(Effect.provide(MainLive))
```

**Key Technologies:**
- Effect-ts v3.19+ with Service pattern
- @effect/platform for FileSystem/Path
- @effect/schema for runtime validation
- @effect/cli for type-safe commands
- culori for color space conversions

## How It Works

1. **Input Color**: You provide a color in any format and specify which stop position (100-1000) it represents
2. **Pattern Learning**: The generator analyzes an example palette to learn lightness, chroma, and hue transformation patterns
3. **Pattern Smoothing**: Mathematical smoothing ensures perceptually uniform progression
4. **Bidirectional Generation**: Generates lighter stops (above anchor) and darker stops (below anchor)
5. **Gamut Correction**: Automatically clamps colors to stay within sRGB gamut
6. **Format Conversion**: Converts all stops to your requested output format

## Testing

Comprehensive test suite with **118 passing tests** and **95% service coverage**:

**Coverage:**
- Services: 95% (ConfigService: 100%, PatternService: 92%, ExportService: 97%, PaletteService: 95%)
- Domain logic: 97% (interpolation, statistics, palette generation)
- CLI integration: 8 tests

**Test Categories:**
- Color conversions (9 tests) - OKLCH ↔ hex/rgb/oklab
- Interpolation algorithms (30 tests) - lerp, clamp, smoothing
- Pattern extraction (18 tests) - statistics, median, confidence
- Service operations (43 tests) - config, pattern loading, export, generation
- CLI integration (8 tests) - single/batch modes
- Error handling - invalid inputs, file I/O failures

```sh
pnpm test          # Run all tests
pnpm coverage      # Generate coverage report
```
