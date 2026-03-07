export interface Command {
  name: string;
  shortcut: string;
  description: string;
  action: string; // Action type to handle in App
}

export const commands: Command[] = [
  {
    name: "index",
    shortcut: "i",
    description: "Re-index all documents",
    action: "index",
  },
  {
    name: "reset",
    shortcut: "r",
    description: "Clear all indexed data",
    action: "reset",
  },
  {
    name: "theme",
    shortcut: "t",
    description: "Switch color theme",
    action: "theme",
  },
  {
    name: "quit",
    shortcut: "q",
    description: "Exit the application",
    action: "quit",
  },
];

export function filterCommands(input: string): Command[] {
  // Remove the leading slash
  const query = input.slice(1).toLowerCase();
  
  if (query === "") {
    return commands;
  }
  
  return commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().startsWith(query) ||
      cmd.shortcut.toLowerCase() === query
  );
}

export function findExactCommand(input: string): Command | null {
  const query = input.slice(1).toLowerCase().split(" ")[0];
  
  return commands.find(
    (cmd) => cmd.name.toLowerCase() === query || cmd.shortcut.toLowerCase() === query
  ) ?? null;
}

export function getCommandArgs(input: string): string {
  const parts = input.slice(1).split(" ");
  return parts.slice(1).join(" ");
}
