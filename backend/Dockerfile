FROM python:3.11-slim

RUN pip install uv

# Install dependencies into /venv (outside /app so dev volume mounts don't overwrite it)
COPY pyproject.toml uv.lock /tmp/build/
RUN UV_PROJECT_ENVIRONMENT=/venv uv sync --frozen --no-dev --project /tmp/build

ENV PATH="/venv/bin:$PATH"
ENV VIRTUAL_ENV="/venv"

WORKDIR /app
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
