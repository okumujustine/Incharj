import { config } from "../config";
import { BaseConnector, type ConnectorDocument } from "./base";
import { registerConnector } from "./registry";

const SLACK_AUTH_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const SLACK_CONVERSATIONS_LIST = "https://slack.com/api/conversations.list";
const SLACK_CONVERSATIONS_HISTORY = "https://slack.com/api/conversations.history";
const SLACK_REPLIES_URL = "https://slack.com/api/conversations.replies";
const SLACK_SCOPES = "channels:read,channels:history,groups:read,groups:history";

@registerConnector("slack")
export class SlackConnector extends BaseConnector {
  private botToken() {
    return String(this.credentials.access_token ?? this.credentials.bot_token ?? "");
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.slackClientId,
      redirect_uri: `${config.frontendUrl}/oauth/slack/callback`,
      scope: SLACK_SCOPES,
      state
    });
    return `${SLACK_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const response = await fetch(SLACK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.slackClientId,
        client_secret: config.slackClientSecret,
        code,
        redirect_uri: redirectUri
      })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (!data.ok) {
      throw new Error(`Slack OAuth error: ${String(data.error ?? "unknown")}`);
    }
    return data;
  }

  async refreshCredentials() {
    return null;
  }

  private headers() {
    return { Authorization: `Bearer ${this.botToken()}` };
  }

  async *listDocuments(cursor?: string | null): AsyncGenerator<ConnectorDocument> {
    const channels = await this.listChannels();
    for (const channel of channels) {
      for await (const message of this.listChannelMessages(
        String(channel.id),
        String(channel.name ?? channel.id),
        cursor ?? undefined
      )) {
        yield message;
      }
    }
  }

  private async listChannels(): Promise<Array<Record<string, unknown>>> {
    const channels: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;

    while (true) {
      const params = new URLSearchParams({
        limit: "200",
        types: "public_channel,private_channel"
      });
      if (cursor) {
        params.set("cursor", cursor);
      }
      const response = await fetch(`${SLACK_CONVERSATIONS_LIST}?${params.toString()}`, {
        headers: this.headers()
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        ok?: boolean;
        channels?: Array<Record<string, unknown>>;
        response_metadata?: { next_cursor?: string };
      };
      if (!data.ok) {
        break;
      }
      channels.push(...(data.channels ?? []));
      cursor = data.response_metadata?.next_cursor;
      if (!cursor) {
        break;
      }
    }

    return channels;
  }

  private async *listChannelMessages(
    channelId: string,
    channelName: string,
    oldestTs?: string
  ): AsyncGenerator<ConnectorDocument> {
    let cursor: string | undefined;

    while (true) {
      const params = new URLSearchParams({
        channel: channelId,
        limit: "200"
      });
      if (oldestTs) {
        params.set("oldest", oldestTs);
      }
      if (cursor) {
        params.set("cursor", cursor);
      }

      const response = await fetch(
        `${SLACK_CONVERSATIONS_HISTORY}?${params.toString()}`,
        { headers: this.headers() }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        ok?: boolean;
        messages?: Array<Record<string, unknown>>;
        response_metadata?: { next_cursor?: string };
      };
      if (!data.ok) {
        break;
      }

      for (const message of data.messages ?? []) {
        if (message.type !== "message" || message.subtype) {
          continue;
        }
        const ts = String(message.ts ?? "");
        const timestamp = ts ? new Date(Number.parseFloat(ts) * 1000) : null;
        yield {
          external_id: `${channelId}:${ts}`,
          url: null,
          title: `#${channelName} - ${timestamp?.toISOString().slice(0, 10) ?? ts}`,
          kind: "message",
          ext: "slack",
          author_name: null,
          author_email: null,
          mtime: timestamp?.toISOString() ?? null,
          metadata: {
            channel_id: channelId,
            channel_name: channelName,
            ts,
            thread_ts: message.thread_ts ?? null,
            reply_count: message.reply_count ?? 0
          }
        };
      }

      cursor = data.response_metadata?.next_cursor;
      if (!cursor) {
        break;
      }
    }
  }

  async fetchContent(
    _externalId: string,
    metadata: Record<string, unknown>
  ): Promise<string | null> {
    const channelId = String(metadata.channel_id ?? "");
    const ts = String(metadata.ts ?? "");
    const threadTs = metadata.thread_ts ? String(metadata.thread_ts) : null;
    const parts: string[] = [];

    if (threadTs && threadTs !== ts) {
      return null;
    }

    if (threadTs === ts) {
      const response = await fetch(
        `${SLACK_REPLIES_URL}?${new URLSearchParams({
          channel: channelId,
          ts
        }).toString()}`,
        { headers: this.headers() }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        ok?: boolean;
        messages?: Array<Record<string, unknown>>;
      };
      if (data.ok) {
        for (const message of data.messages ?? []) {
          const text = String(message.text ?? "").trim();
          if (text) {
            parts.push(text);
          }
        }
      }
    } else {
      const response = await fetch(
        `${SLACK_CONVERSATIONS_HISTORY}?${new URLSearchParams({
          channel: channelId,
          latest: ts,
          limit: "1",
          inclusive: "true"
        }).toString()}`,
        { headers: this.headers() }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        ok?: boolean;
        messages?: Array<Record<string, unknown>>;
      };
      if (data.ok && data.messages?.[0]) {
        const text = String(data.messages[0].text ?? "").trim();
        if (text) {
          parts.push(text);
        }
      }
    }

    const content = parts.join("\n\n");
    return content.trim() ? content : null;
  }
}
