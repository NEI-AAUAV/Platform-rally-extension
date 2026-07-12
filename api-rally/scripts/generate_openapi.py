"""Generate the OpenAPI schema offline and write it to web-rally/openapi.json.

The frontend client generator (openapi-typescript) consumes this file. Generating
it from the FastAPI app avoids standing up the server in CI. Run from anywhere:

    poetry run python scripts/generate_openapi.py

The output path is resolved relative to this file, so the caller's working
directory does not matter.
"""

import json
import sys
from pathlib import Path

# Ensure the api-rally package root is importable regardless of the caller's cwd.
# Running a script *file* puts scripts/ on sys.path (not api-rally/), unlike the
# stdin form, so add the parent explicitly before importing app.*.
API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

from fastapi.openapi.utils import get_openapi  # noqa: E402

from app.main import app  # noqa: E402

# api-rally/scripts/generate_openapi.py -> repo root -> web-rally/openapi.json
REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "web-rally" / "openapi.json"


def main() -> None:
    schema = get_openapi(
        title=getattr(app, "title", "API"),
        version=getattr(app, "version", "0.0.0"),
        routes=app.routes,
    )
    # Pretty-print with a trailing newline so the committed contract stays
    # human-diffable in CI (its stated purpose) and regenerating produces a
    # minimal, meaningful diff instead of a whole-file rewrite. Key order is
    # left as FastAPI emits it (route/definition order) — deterministic across
    # runs and stable under review, unlike alphabetical sorting which would
    # scatter each schema's fields.
    OUT_PATH.write_text(json.dumps(schema, indent=2) + "\n")
    print(f"Wrote schema to {OUT_PATH}")


if __name__ == "__main__":
    main()
