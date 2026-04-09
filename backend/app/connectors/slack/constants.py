from __future__ import annotations

SLACK_API_BASE = "https://slack.com/api"

SLACK_CONVERSATIONS_LIST = f"{SLACK_API_BASE}/conversations.list"
SLACK_CONVERSATIONS_HISTORY = f"{SLACK_API_BASE}/conversations.history"
SLACK_CONVERSATIONS_REPLIES = f"{SLACK_API_BASE}/conversations.replies"

# Message subtypes to ignore — system events, not human content
SKIP_SUBTYPES = {"channel_join", "channel_leave", "channel_name", "bot_message"}

# Hard cap on messages enumerated per sync run
ABSOLUTE_MESSAGE_CAP = 10_000

# Messages fetched per API page (Slack max is 200)
PAGE_SIZE = 200
