import { config } from "../config";
import { registerConnectorProvider } from "./registry";
import type {
  ConnectorDocumentRef,
  ConnectorEnumerateInput,
  ConnectorFetchInput,
  ConnectorProvider,
} from "./plugin-types";
import { SyncErrorCode, SyncPipelineError } from "../types/sync-errors";

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_SEARCH_URL = "https://api.notion.com/v1/search";
const NOTION_BLOCKS_URL = "https://api.notion.com/v1/blocks/{block_id}/children";
const NOTION_API_VERSION = "2022-06-28";

function notionHeaders(credentials: Record<string, unknown>) {
  return {
    Authorization: `Bearer ${String(credentials.access_token ?? "")}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": "application/json",
  };
}

function extractPageTitle(page: Record<string, unknown>): string | null {
  const properties = (page.properties as Record<string, unknown> | undefined) ?? {};
  for (const key of ["title", "Name", "Title"]) {
    const property = properties[key] as Record<string, unknown> | undefined;
    if (property?.type === "title" && Array.isArray(property.title)) {
      const title = property.title
        .map((part) => (part as Record<string, unknown>).plain_text ?? "")
        .join("");
      return title || null;
    }
  }
  return null;
}

function extractBlockText(block: Record<string, unknown>): string | null {
  const type = String(block.type ?? "");
  const blockData = (block[type] as Record<string, unknown> | undefined) ?? {};
  if (Array.isArray(blockData.rich_text)) {
    const content = blockData.rich_text
      .map((part) => (part as Record<string, unknown>).plain_text ?? "")
      .join("");
    if (content) return content;
  }

  if (type === "image") {
    if (Array.isArray(blockData.caption) && blockData.caption.length) {
      const caption = blockData.caption
        .map((part) => (part as Record<string, unknown>).plain_text ?? "")
        .join("");
      return `[Image: ${caption}]`;
    }
    return "[Image]";
  }

  if (type === "divider") return "---";
  return null;
}

async function collectBlocks(
  credentials: Record<string, unknown>,
  blockId: string,
  parts: string[],
  depth: number
): Promise<void> {
  if (depth > 5) return;

  let cursor: string | undefined;
  while (true) {
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) params.set("start_cursor", cursor);

    const response = await fetch(
      `${NOTION_BLOCKS_URL.replace("{block_id}", blockId)}?${params.toString()}`,
      { headers: notionHeaders(credentials) }
    );

    if (response.status === 404) return;
    if (!response.ok) {
      throw new SyncPipelineError({
        code: SyncErrorCode.FetchFailed,
        stage: "fetch",
        message: await response.text(),
        retriable: response.status >= 500,
      });
    }

    const data = (await response.json()) as {
      results?: Array<Record<string, unknown>>;
      has_more?: boolean;
      next_cursor?: string;
    };

    for (const block of data.results ?? []) {
      const text = extractBlockText(block);
      if (text) {
        parts.push(`${"  ".repeat(depth)}${text}`);
      }
      if (block.has_children) {
        await collectBlocks(credentials, String(block.id), parts, depth + 1);
      }
    }

    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
}

async function enumerateNotion(input: ConnectorEnumerateInput) {
  let startCursor = typeof input.checkpoint?.cursor === "string"
    ? input.checkpoint.cursor
    : undefined;

  const refs: ConnectorDocumentRef[] = [];
  let maxEditedTime = typeof input.checkpoint?.modifiedAfter === "string"
    ? input.checkpoint.modifiedAfter
    : null;

  while (true) {
    const body: Record<string, unknown> = {
      page_size: 100,
      filter: { property: "object", value: "page" },
    };
    if (startCursor) {
      body.start_cursor = startCursor;
    }

    const response = await fetch(NOTION_SEARCH_URL, {
      method: "POST",
      headers: notionHeaders(input.credentials),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new SyncPipelineError({
        code: SyncErrorCode.EnumerationFailed,
        stage: "enumeration",
        message: await response.text(),
        retriable: response.status >= 500,
      });
    }

    const data = (await response.json()) as {
      results?: Array<Record<string, unknown>>;
      has_more?: boolean;
      next_cursor?: string;
    };

    for (const page of data.results ?? []) {
      const pageId = String(page.id ?? "").replace(/-/g, "");
      const edited = (page.last_edited_time as string | undefined) ?? null;
      if (edited && (!maxEditedTime || edited > maxEditedTime)) {
        maxEditedTime = edited;
      }

      refs.push({
        externalId: pageId,
        url: (page.url as string | undefined) ?? null,
        title: extractPageTitle(page),
        kind: "page",
        ext: "notion",
        authorName: null,
        authorEmail: null,
        contentType: "text/plain",
        sourcePath: null,
        sourceLastModifiedAt: edited,
        sourcePermissions: null,
        metadata: {
          object: page.object ?? null,
          archived: page.archived ?? false,
        },
      });
    }

    if (!data.has_more) {
      return {
        refs,
        nextCheckpoint: {
          cursor: null,
          modifiedAfter: maxEditedTime,
        },
      };
    }

    startCursor = data.next_cursor;
  }
}

async function fetchNotionDocument(input: ConnectorFetchInput) {
  const parts: string[] = [];
  await collectBlocks(input.credentials, input.ref.externalId, parts, 0);
  const content = parts.join("\n").trim();

  return {
    content: content || null,
    contentType: "text/plain",
    sourcePath: null,
    sourcePermissions: null,
    metadata: input.ref.metadata,
  };
}

const notionProvider: ConnectorProvider = {
  manifest: {
    key: "notion",
    displayName: "Notion",
    authType: "oauth2",
    supportsIncremental: true,
    supportsAcl: false,
    supportedContentTypes: ["text/plain"],
    maxPageSize: 100,
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: 1_500,
      strategy: "exponential",
    },
    capabilities: {
      supportsWebhooks: false,
      supportsDeleteEvents: false,
      supportsPerDocumentPermissions: false,
    },
  },
  auth: {
    authorizeUrl(state: string) {
      const params = new URLSearchParams({
        client_id: config.notionClientId,
        redirect_uri: `${config.frontendUrl}/oauth/notion/callback`,
        response_type: "code",
        owner: "user",
        state,
      });
      return `${NOTION_AUTH_URL}?${params.toString()}`;
    },
    async exchangeCode(code: string, redirectUri: string) {
      const auth = Buffer.from(`${config.notionClientId}:${config.notionClientSecret}`).toString("base64");
      const response = await fetch(NOTION_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return (await response.json()) as Record<string, unknown>;
    },
    async refreshCredentials() {
      return null;
    },
  },
  plugin: {
    validateConfig(configData) {
      return (configData ?? {}) as Record<string, unknown>;
    },
    enumerate: enumerateNotion,
    fetchDocument: fetchNotionDocument,
  },
};

registerConnectorProvider(notionProvider);
