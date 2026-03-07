/**
 * Components Module
 * 
 * Central export point for all UI components.
 * Organizes components into logical groups:
 * 
 * - Common: Reusable primitives (ProgressBar, TextHighlighter, StatusMessage)
 * - Header: Application header components
 * - Search: Search results display components
 * - Utility: Helper components (SearchInput, CommandPalette, etc.)
 */

// Re-export all common components
export * from "./common/index.js";

// Re-export all header components
export * from "./header/index.js";

// Re-export all search components
export * from "./search/index.js";

// Standalone utility components
export { SearchInput } from "./SearchInput.js";
export { PathBar } from "./PathBar.js";
export { CommandPalette } from "./CommandPalette.js";
export { IndexResults } from "./IndexResults.js";
