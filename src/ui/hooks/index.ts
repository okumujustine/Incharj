/**
 * Hooks Module
 * 
 * Custom React hooks that encapsulate business logic and state management.
 * These hooks extract complexity from components, making them more focused
 * on presentation while keeping logic testable and reusable.
 * 
 * Hook Categories:
 * - Configuration: useAppConfig
 * - Search: useSearch
 * - Navigation: useKeyboardNavigation
 * - Commands: useCommandExecution
 * - Input: useInputHandler
 * - Files: useFileOpener
 */

export { useAppConfig, type AppConfig } from "./useAppConfig.js";
export { useSearch } from "./useSearch.js";
export { useKeyboardNavigation } from "./useKeyboardNavigation.js";
export { useCommandExecution, type IndexingProgress } from "./useCommandExecution.js";
export { useInputHandler } from "./useInputHandler.js";
export { useFileOpener } from "./useFileOpener.js";
