FROM python:3.11-slim

RUN pip install uv

COPY pyproject.toml uv.lock /tmp/build/
RUN UV_PROJECT_ENVIRONMENT=/venv uv sync --frozen --no-dev --project /tmp/build

ENV PATH="/venv/bin:$PATH"
ENV VIRTUAL_ENV="/venv"

WORKDIR /app
COPY . .

CMD ["python", "main.py"]
