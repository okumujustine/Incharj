from __future__ import annotations

import asyncio
from secrets import load_infisical
load_infisical()  # must run before BotSettings reads os.environ

from slack.app import create_slack_app
from config import BotSettings
from slack.transport import run_transport


async def main() -> None:
    settings = BotSettings.from_env()
    app = create_slack_app(settings)
    await run_transport(app, settings)


if __name__ == "__main__":
    asyncio.run(main())
