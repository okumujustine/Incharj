import { config } from "../../config";
import { BaseConnector, type ConnectorDocument } from "./base";
import { registerConnector } from "./registry";

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_SEARCH_URL = "https://api.notion.com/v1/search";
const NOTION_BLOCKS_URL = "https://api.notion.com/v1/blocks/{block_id}/children";
const NOTION_API_VERSION = "2022-06-28";

@registerConnector("notion")
export class NotionConnector extends BaseConnector {
  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.notionClientId,
      redirect_uri: `${config.frontendUrl}/oauth/notion/callback`,
      response_type: "code",
      owner: "user",
      state
    });
    return `${NOTION_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const auth = Buffer.from(
      `${config.notionClientId}:${config.notionClientSecret}`
    ).toString("base64");

    const response = await fetch(NOTION_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as Record<string, unknown>;
  }

  async refreshCredentials() {
    return null;
  }

  private headers() {
    return {
      Authorization: `Bearer ${String(this.credentials.access_token ?? "")}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json"
    };
  }

  async *listDocuments(cursor?: string | null): AsyncGenerator<ConnectorDocument> {
    let startCursor = cursor ?? undefined;

    while (true) {
      const response = await fetch(NOTION_SEARCH_URL, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          page_size: 100,
          filter: { property: "object", value: "page" },
          ...(startCursor ? { start_cursor: startCursor } : {})
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        results?: Array<Record<string, unknown>>;
        has_more?: boolean;
        next_cursor?: string;
      };

      for (const page of data.results ?? []) {
        const pageId = String(page.id ?? "").replace(/-/g, "");
        yield {
          external_id: pageId,
          url: (page.url as string | undefined) ?? null,
          title: this.extractPageTitle(page),
          kind: "page",
          ext: "notion",
          author_name: null,
          author_email: null,
          mtime: (page.last_edited_time as string | undefined) ?? null,
          metadata: {
            object: page.object ?? null,
            archived: page.archived ?? false
          }
        };
      }

      if (!data.has_more) {
        break;
      }
      startCursor = data.next_cursor;
    }
  }

  private extractPageTitle(page: Record<string, unknown>): string | null {
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

  async fetchContent(
    externalId: string,
    _metadata: Record<string, unknown>
  ): Promise<string | null> {
    const parts: string[] = [];
    await this.collectBlocks(externalId, parts, 0);
    const content = parts.join("\n");
    return content.trim() ? content : null;
  }

  private async collectBlocks(
    blockId: string,
    parts: string[],
    depth: number
  ): Promise<void> {
    if (depth > 5) {
      return;
    }

    let cursor: string | undefined;
    while (true) {
      const params = new URLSearchParams({ page_size: "100" });
      if (cursor) {
        params.set("start_cursor", cursor);
      }

      const response = await fetch(
        `${NOTION_BLOCKS_URL.replace("{block_id}", blockId)}?${params.toString()}`,
        { headers: this.headers() }
      );
      if (response.status === 404) {
        return;
      }
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        results?: Array<Record<string, unknown>>;
        has_more?: boolean;
        next_cursor?: string;
      };

      for (const block of data.results ?? []) {
        const text = this.extractBlockText(block);
        if (text) {
          parts.push(`${"  ".repeat(depth)}${text}`);
        }
        if (block.has_children) {
          await this.collectBlocks(String(block.id), parts, depth + 1);
        }
      }

      if (!data.has_more) {
        break;
      }
      cursor = data.next_cursor;
    }
  }

  private extractBlockText(block: Record<string, unknown>): string | null {
    const type = String(block.type ?? "");
    const blockData = (block[type] as Record<string, unknown> | undefined) ?? {};
    if (Array.isArray(blockData.rich_text)) {
      const content = blockData.rich_text
        .map((part) => (part as Record<string, unknown>).plain_text ?? "")
        .join("");
      if (content) {
        return content;
      }
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

    if (type === "divider") {
      return "---";
    }

    return null;
  }
}
