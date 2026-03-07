import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { useMemo } from "react";

/** Application configuration structure */
export interface AppConfig {
  /** Directories to search (supports ~ for home directory) */
  folders: string[];
  /** File extensions to index (including the dot) */
  extensions: string[];
  /** Optional glob ignore patterns for indexing */
  ignore: string[];
  /** Preferred theme name */
  theme: string;
}

export interface AppConfigState {
  config: AppConfig;
  configPath: string;
  fromFile: boolean;
  warnings: string[];
}

const DEFAULT_CONFIG: AppConfig = {
  folders: ["~/Documents", "~/Projects", "~/Desktop"],
  extensions: [".md", ".txt", ".json", ".yml", ".pdf"],
  ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.next/**"],
  theme: "cyan",
};

export function getConfigPath(): string {
  return path.join(os.homedir(), ".incharj", "config.json");
}

function normalizeExtensions(input: unknown): string[] {
  if (!Array.isArray(input)) return DEFAULT_CONFIG.extensions;
  const normalized = input
    .map((e) => (typeof e === "string" ? e.trim() : ""))
    .filter(Boolean)
    .map((e) => (e.startsWith(".") ? e : `.${e}`));
  return normalized.length > 0 ? normalized : DEFAULT_CONFIG.extensions;
}

function normalizeStringArray(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) return fallback;
  const normalized = input
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

export function loadAppConfig(): AppConfigState {
  const configPath = getConfigPath();
  const warnings: string[] = [];

  if (!fs.existsSync(configPath)) {
    return {
      config: DEFAULT_CONFIG,
      configPath,
      fromFile: false,
      warnings,
    };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;

    const themeName =
      typeof parsed.theme === "string" && parsed.theme.trim().length > 0
        ? parsed.theme.trim().toLowerCase()
        : DEFAULT_CONFIG.theme;

    return {
      config: {
        folders: normalizeStringArray(parsed.folders, DEFAULT_CONFIG.folders),
        extensions: normalizeExtensions(parsed.extensions),
        ignore: normalizeStringArray(parsed.ignore, DEFAULT_CONFIG.ignore),
        theme: themeName,
      },
      configPath,
      fromFile: true,
      warnings,
    };
  } catch (err) {
    warnings.push(`Invalid config at ${configPath}: ${String(err)}`);
    return {
      config: DEFAULT_CONFIG,
      configPath,
      fromFile: true,
      warnings,
    };
  }
}

export function useAppConfig(): AppConfigState {
  return useMemo(() => loadAppConfig(), []);
}
