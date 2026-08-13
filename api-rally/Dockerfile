FROM python:3.12-slim AS requirements-stage

ENV PYTHONUNBUFFERED=1
ENV POETRY_INSTALLER_ONLY_BINARY=":all:"
# http-ece (pywebpush dependency) only ships an sdist on PyPI — pure Python,
# no build script, so it's carved out of the binary-only guard by name.
ENV POETRY_INSTALLER_NO_BINARY="http-ece"

WORKDIR /api_rally

RUN apt-get update && \
    apt-get -y install --no-install-recommends gcc=4:14.2.0-1 libpq-dev=17.11-0+deb13u1 && \
    rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir --upgrade --only-binary :all: pip==24.3.1 && \
    pip install --no-cache-dir --only-binary :all: poetry==2.4.1 && \
    useradd --create-home appuser && \
    chown appuser:appuser /api_rally

USER appuser

COPY --chown=appuser:appuser poetry.lock pyproject.toml ./

# Only binary wheels are allowed (via POETRY_INSTALLER_ONLY_BINARY env var) to prevent execution of untrusted build scripts
RUN poetry install --no-root --no-cache

COPY --chown=appuser:appuser app ./app
COPY --chown=appuser:appuser alembic ./alembic
COPY --chown=appuser:appuser alembic.ini pytest.ini ./
COPY --chown=appuser:appuser static ./static

# Only binary wheels are allowed (via POETRY_INSTALLER_ONLY_BINARY env var) to prevent execution of untrusted build scripts
RUN poetry install --no-cache

EXPOSE 8003
# --reload uses watchfiles (installed as a dev dep) for event-based watching.
# app/tests is ~12MB of the 16MB tree and is never imported by the server, so
# excluding it keeps the watch set small.
CMD ["poetry", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003", "--reload", "--reload-dir", "app", "--reload-exclude", "tests/*", "--reload-exclude", "*/__pycache__/*"]
