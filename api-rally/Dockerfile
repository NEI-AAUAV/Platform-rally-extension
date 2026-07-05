FROM python:3.12-slim AS requirements-stage

ENV PYTHONUNBUFFERED=1

WORKDIR /api_rally

RUN apt-get update && \
    apt-get -y install --no-install-recommends libpq-dev=17.10-0+deb13u1 gcc=4:14.2.0-1 && \
    rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir --upgrade --only-binary :all: pip==24.3.1 && \
    pip install --no-cache-dir --only-binary :all: poetry==1.8.5 && \
    useradd --create-home appuser

COPY poetry.lock pyproject.toml ./

RUN poetry install --no-root --no-cache --no-directory

COPY --chown=appuser:appuser app ./app
COPY --chown=appuser:appuser alembic ./alembic
COPY --chown=appuser:appuser alembic.ini pytest.ini ./
COPY --chown=appuser:appuser static ./static

RUN poetry install --no-cache && \
    chown -R appuser:appuser /api_rally

USER appuser

EXPOSE 8003
CMD ["poetry", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003", "--reload", "--reload-dir", "app"]
