/**
 * Color-related error types using Effect's tagged errors
 */

import { Data } from "effect"

/**
 * Error thrown when a color string cannot be parsed
 */
export class ColorParseError extends Data.TaggedError("ColorParseError")<{
  readonly input: string
  readonly reason: string
}> {}

/**
 * Error thrown when a color cannot be converted between color spaces
 */
export class ColorConversionError extends Data.TaggedError("ColorConversionError")<{
  readonly fromSpace: string
  readonly toSpace: string
  readonly color: unknown
  readonly reason: string
}> {}

/**
 * Error thrown when a color is outside the displayable gamut
 */
export class GamutError extends Data.TaggedError("GamutError")<{
  readonly color: unknown
  readonly message: string
}> {}

/**
 * Error thrown when a color transformation fails
 */
export class ColorTransformationError extends Data.TaggedError("ColorTransformationError")<{
  readonly reference: unknown
  readonly target: unknown
  readonly reason: string
}> {}

/**
 * Error thrown when transformation syntax cannot be parsed
 */
export class TransformationParseError extends Data.TaggedError("TransformationParseError")<{
  readonly input: string
  readonly reason: string
}> {}
