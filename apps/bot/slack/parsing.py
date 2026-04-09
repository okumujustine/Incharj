from __future__ import annotations

import re


def extract_query(text: str) -> str:
    return re.sub(r"<@[A-Z0-9]+>", "", text).strip()
