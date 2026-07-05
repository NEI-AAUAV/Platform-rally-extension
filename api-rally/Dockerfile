FROM python:3.12-slim AS requirements-stage

ENV PYTHONUNBUFFERED 1

WORKDIR /api_rally

RUN apt-get update && \
    apt-get -y install --no-install-recommends libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --upgrade poetry

COPY poetry.lock pyproject.toml ./

RUN poetry install --no-root --no-cache

COPY --chown=nobody:nogroup . .

RUN poetry install --no-cache

RUN useradd --create-home appuser
USER appuser

EXPOSE 8003
CMD ["poetry", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003", "--reload", "--reload-dir", "app"]
