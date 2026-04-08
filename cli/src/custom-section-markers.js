/**
 * Section markers for generated code boundaries.
 *
 * These delimiters mark boundaries of generated code blocks in Schema Forge
 * frontend components. The generator wraps all generated sections with
 * GENERATED_START / GENERATED_END so they can be identified and replaced
 * on re-generation.
 *
 * @module custom-section-markers
 */

/** Marker prefix used for all Schema Forge section delimiters. */
export const SF_PREFIX = '@sf-';

export const MARKERS = {
  /** Start of a generated code block (will be overwritten on regeneration). */
  GENERATED_START: (id) => `// @sf-generated-start ${id}`,
  /** End of a generated code block. */
  GENERATED_END: (id) => `// @sf-generated-end ${id}`,
};

/**
 * Regex patterns for parsing marker lines.
 * Each captures the section ID in group 1.
 */
export const PATTERNS = {
  GENERATED_START: /^\/\/\s*@sf-generated-start\s+(.+)$/,
  GENERATED_END: /^\/\/\s*@sf-generated-end\s+(.+)$/,
};
