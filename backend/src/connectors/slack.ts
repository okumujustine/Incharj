import { config } from "../config";
import { registerConnectorProvider } from "./registry";
import type {
  ConnectorDocumentRef,
  ConnectorEnumerateInput,
  ConnectorFetchInput,
  ConnectorProvider,
} from "./plugin-types";
import { SyncErrorCode, SyncPipelineError } from "../types/sync-errors";

const SLACK_AUTH_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const SLACK_CONVERSATIONS_LIST = "https://slack.com/api/conversations.list";
const SLACK_CONVERSATIONS_HISTORY = "https://slack.com/api/conversations.history";
const SLACK_REPLIES_URL = "https://slack.com/api/conversations.replies";
const SLACK_SCOPES = "channels:read,channels:history,groups:read,groups:history";

function botToken(credentials: Record<string, unknown>) {
  return String(credentials.access_token ?? credentials.bot_token ?? "");
}

function slackHeaders(credentials: Record<string, unknown>) {
  return { Authorization: `Bearer ${botToken(credentials)}` };
}

async function listChannels(credentials: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const channels: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;

  while (true) {
    const params = new URLSearchParams({
      limit: "200",
      types: "public_channel,private_channel",
    });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`${SLACK_CONVERSATIONS_LIST}?${params.toString()}`, {
      headers: slackHeaders(credentials),
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
      ok?: boolean;
      channels?: Array<Record<string, unknown>>;
      response_metadata?: { next_cursor?: string };
      error?: string;
    };

    if (!data.ok) {
      throw new SyncPipelineError({
        code: SyncErrorCode.EnumerationFailed,
        stage: "enumeration",
        message: `Slack channels.list failed: ${String(data.error ?? "unknown")}`,
        retriable: false,
      });
    }

    channels.push(...(data.channels ?? []));
    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return channels;
}

async function listChannelMessages(
  credentials: Record<string, unknown>,
  channelId: string,
  channelName: string,
  oldestTs?: string
): Promise<ConnectorDocumentRef[]> {
  const refs: ConnectorDocumentRef[] = [];
  let cursor: string | undefined;

  while (true) {
    const params = new URLSearchParams({ channel: channelId, limit: "200" });
    if (oldestTs) params.set("oldest", oldestTs);
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`${SLACK_CONVERSATIONS_HISTORY}?${params.toString()}`, {
      headers: slackHeaders(credentials),
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
      ok?: boolean;
      messages?: Array<Record<string, unknown>>;
      response_metadata?: { next_cursor?: string };
      error?: string;
    };

    if (!data.ok) {
      throw new SyncPipelineError({
        code: SyncErrorCode.EnumerationFailed,
        stage: "enumeration",
        message: `Slack conversations.history failed: ${String(data.error ?? "unknown")}`,
        retriable: false,
      });
    }

    for (const message of data.messages ?? []) {
      if (message.type !== "message" || message.subtype) continue;

      const ts = String(message.ts ?? "");
      const timestamp = ts ? new Date(Number.parseFloat(ts) * 1000) : null;

      refs.push({
        externalId: `${channelId}:${ts}`,
        url: null,
        title: `#${channelName} - ${timestamp?.toISOString().slice(0, 10) ?? ts}`,
        kind: "message",
        ext: "slack",
        authorName: null,
        authorEmail: null,
        contentType: "text/plain",
        sourcePath: channelName,
        sourceLastModifiedAt: timestamp?.toISOString() ?? null,
        sourcePermissions: null,
        metadata: {
          channel_id: channelId,
          channel_name: channelName,
          ts,
          thread_ts: message.thread_ts ?? null,
          reply_count: message.reply_count ?? 0,
        },
      });
    }

    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return refs;
}

async function enumerateSlack(input: ConnectorEnumerateInput) {
  const channels = await listChannels(input.credentials);

  const modifiedAfter = typeof input.checkpoint?.modifiedAfter === "string"
    ? input.checkpoint.modifiedAfter
    : null;

  const oldestTs = modifiedAfter
    ? (Date.parse(modifiedAfter) / 1000).toString()
    : undefined;

  const refs: ConnectorDocumentRef[] = [];
  let maxMtime = modifiedAfter;

  for (const channel of channels) {
    const channelId = String(channel.id ?? "");
    const channelName = String(channel.name ?? channel.id ?? "unknown");
    const channelRefs = await listChannelMessages(input.credentials, channelId, channelName, oldestTs);
    refs.push(...channelRefs);

    for (const ref of channelRefs) {
      if (ref.sourceLastModifiedAt && (!maxMtime || ref.sourceLastModifiedAt > maxMtime)) {
        maxMtime = ref.sourceLastModifiedAt;
      }
    }
  }

  return {
    refs,
    nextCheckpoint: {
      cursor: null,
      modifiedAfter: maxMtime,
    },
  };
}

async function fetchSlackDocument(input: ConnectorFetchInput) {
  const channelId = String(input.ref.metadata.channel_id ?? "");
  const ts = String(input.ref.metadata.ts ?? "");
  const threadTs = input.ref.metadata.thread_ts ? String(input.ref.metadata.thread_ts) : null;
  const parts: string[] = [];

  if (threadTs && threadTs !== ts) {
    return {
      content: null,
      contentType: "text/plain",
      sourcePath: input.ref.sourcePath,
      sourcePermissions: null,
      metadata: input.ref.metadata,
    };
  }

  if (threadTs === ts) {
    const response = await fetch(
      `${SLACK_REPLIES_URL}?${new URLSearchParams({ channel: channelId, ts }).toString()}`,
      { headers: slackHeaders(input.credentials) }
    );

    if (!response.ok) {
      throw new SyncPipelineError({
        code: SyncErrorCode.FetchFailed,
        stage: "fetch",
        message: await response.text(),
        retriable: response.status >= 500,
      });
    }

    const data = (await response.json()) as {
      ok?: boolean;
      messages?: Array<Record<string, unknown>>;
      error?: string;
    };

    if (!data.ok) {
      throw new SyncPipelineError({
        code: SyncErrorCode.FetchFailed,
        stage: "fetch",
        message: `Slack replies failed: ${String(data.error ?? "unknown")}`,
        retriable: false,
      });
    }

    for (const message of data.messages ?? []) {
      const text = String(message.text ?? "").trim();
      if (text) parts.push(text);
    }
  } else {
    const response = await fetch(
      `${SLACK_CONVERSATIONS_HISTORY}?${new URLSearchParams({
        channel: channelId,
        latest: ts,
        limit: "1",
        inclusive: "true",
      }).toString()}`,
      { headers: slackHeaders(input.credentials) }
    );

    if (!response.ok) {
      throw new SyncPipelineError({
        code: SyncErrorCode.FetchFailed,
        stage: "fetch",
        message: await response.text(),
        retriable: response.status >= 500,
      });
    }

    const data = (await response.json()) as {
      ok?: boolean;
      messages?: Array<Record<string, unknown>>;
      error?: string;
    };

    if (!data.ok) {
      throw new SyncPipelineError({
        code: SyncErrorCode.FetchFailed,
        stage: "fetch",
        message: `Slack history single message failed: ${String(data.error ?? "unknown")}`,
        retriable: false,
      });
    }

    if (data.messages?.[0]) {
      const text = String(data.messages[0].text ?? "").trim();
      if (text) parts.push(text);
    }
  }

  const content = parts.join("\n\n").trim();
  return {
    content: content || null,
    contentType: "text/plain",
    sourcePath: input.ref.sourcePath,
    sourcePermissions: null,
    metadata: input.ref.metadata,
  };
}

const slackProvider: ConnectorProvider = {
  manifest: {
    key: "slack",
    displayName: "Slack",
    authType: "oauth2",
    supportsIncremental: true,
    supportsAcl: false,
    supportedContentTypes: ["text/plain"],
    maxPageSize: 200,
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
        client_id: config.slackClientId,
        redirect_uri: `${config.frontendUrl}/oauth/slack/callback`,
        scope: SLACK_SCOPES,
        state,
      });
      return `${SLACK_AUTH_URL}?${params.toString()}`;
    },
    async exchangeCode(code: string, redirectUri: string) {
      const response = await fetch(SLACK_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.slackClientId,
          client_secret: config.slackClientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!response.ok) throw new Error(await response.text());

      const data = (await response.json()) as Record<string, unknown>;
      if (!data.ok) {
        throw new Error(`Slack OAuth error: ${String(data.error ?? "unknown")}`);
      }
      return data;
    },
    async refreshCredentials() {
      return null;
    },
  },
  plugin: {
    validateConfig(configData) {
      return (configData ?? {}) as Record<string, unknown>;
    },
    enumerate: enumerateSlack,
    fetchDocument: fetchSlackDocument,
  },
};

registerConnectorProvider(slackProvider);
