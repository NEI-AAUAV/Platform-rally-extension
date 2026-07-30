"""Constructor-based DI factories for CRUD repositories, wired via FastAPI
`Depends`. Kept separate from `app.services.deps` (which imports every
service module) so low-level consumers like `abac_deps.py` can depend on a
single repository without pulling in the full service graph and risking
circular imports.
"""

from app import crud
from app.crud.crud_activity import CRUDActivity, CRUDActivityResult
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_team import CRUDTeam


def get_team_crud() -> CRUDTeam:
    return crud.team


def get_checkpoint_crud() -> CRUDCheckPoint:
    return crud.checkpoint


def get_activity_crud() -> CRUDActivity:
    return crud.activity


def get_activity_result_crud() -> CRUDActivityResult:
    return crud.activity_result
