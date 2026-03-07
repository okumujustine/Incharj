/**
 * useKeyboardNavigation Hook
 * 
 * Handles keyboard input for navigating through search results.
 * Listens for up/down arrow keys and adjusts the selected index accordingly.
 * 
 * Features:
 * - Boundary checking to prevent over-scrolling
 * - Focus state awareness (only responds when focused)
 * - Automatic cleanup on unmount
 * 
 * @param options - Configuration for navigation behavior
 */

import { useInput } from "ink";

interface UseKeyboardNavigationOptions {
  /** Current selected index in the list */
  selectedIndex: number;
  /** Function to update the selected index */
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  /** Total number of items in the list */
  itemCount: number;
  /** Whether the input should be listened to (default: true) */
  isActive?: boolean;
}

/**
 * Hook for handling up/down arrow key navigation through a list.
 * 
 * Automatically clamps the index within valid bounds [0, itemCount - 1].
 * Does nothing if itemCount is 0.
 * 
 * @example
 * ```tsx
 * useKeyboardNavigation({
 *   selectedIndex,
 *   setSelectedIndex,
 *   itemCount: results.length,
 *   isActive: !isIndexing
 * });
 * ```
 */
export function useKeyboardNavigation({
  selectedIndex,
  setSelectedIndex,
  itemCount,
  isActive = true,
}: UseKeyboardNavigationOptions): void {
  useInput(
    (input, key) => {
      // Only process if we have items to navigate
      if (itemCount === 0) return;

      // Move selection up (with lower bound check)
      if (key.upArrow && selectedIndex > 0) {
        setSelectedIndex((prev) => prev - 1);
      }

      // Move selection down (with upper bound check)
      if (key.downArrow && selectedIndex < itemCount - 1) {
        setSelectedIndex((prev) => prev + 1);
      }
    },
    { isActive }
  );
}
