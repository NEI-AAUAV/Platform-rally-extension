import pytest

from fastapi.testclient import TestClient
from app.api.auth import ScopeEnum

from app.models import Team
from app.core.config import settings
from app.models.checkpoint import CheckPoint
from app.models.user import User
from app.schemas.team import TeamScoresUpdate
from app.tests.conftest import Session

team = [
    {
        "name": "Test1",
    },
    {
        "name": "Test2",
    },
]


@pytest.fixture(autouse=True)
def setup_database(db: Session):
    """Setup the database before each test in this module."""

    db.add(CheckPoint(id=1, name="Test", shot_name="Test", description="Test"))
    db.add(User(id=1, name="Test", staff_checkpoint_id=1))
    for teams in team:
        db.add(Team(**teams))
    db.commit()


# ===============
# == GET TEAMS ==
# ===============


def test_get_teams_unauthenticated(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/team/")
    data = r.json()
    assert r.status_code == 200
    assert len(data) == 2
    assert data[0].keys() >= team[0].keys()
    assert "id" in data[0]


@pytest.mark.parametrize(
    "client",
    [
        {},
        {"sub": 1},
        {"scopes": [ScopeEnum.ADMIN]},
        {"scopes": [ScopeEnum.MANAGER_RALLY]},
    ],
    indirect=["client"],
)
def test_get_teams(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/team/")
    data = r.json()
    assert r.status_code == 200
    assert len(data) == 2
    assert data[0].keys() >= team[0].keys()
    assert "id" in data[0]


# ====================
# == ADD CHECKPOINT ==
# ====================


def test_add_checkpoint_unauthenticated(client: TestClient, db: Session) -> None:
    team = db.query(Team).first()
    assert team is not None
    id = team.id

    r = client.put(
        f"{settings.API_V1_STR}/team/{id}/checkpoint",
        json=TeamScoresUpdate(question_score=True).model_dump(),
    )
    assert r.status_code == 401


@pytest.mark.parametrize(
    "client",
    [{}],
    indirect=["client"],
)
def test_add_checkpoint_normal_user(client: TestClient, db: Session) -> None:
    team = db.query(Team).first()
    assert team is not None
    id = team.id

    r = client.put(
        f"{settings.API_V1_STR}/team/{id}/checkpoint",
        json=TeamScoresUpdate(question_score=True).model_dump(),
    )
    assert r.status_code == 403


@pytest.mark.parametrize(
    "client",
    [
        {"sub": 1},
        {"scopes": [ScopeEnum.ADMIN]},
        {"scopes": [ScopeEnum.MANAGER_RALLY]},
    ],
    indirect=["client"],
)
def test_add_checkpoint_authenticated(client: TestClient, db: Session) -> None:
    team = db.query(Team).first()
    assert team is not None
    id = team.id

    r = client.put(
        f"{settings.API_V1_STR}/team/{id}/checkpoint",
        json=TeamScoresUpdate(question_score=True, checkpoint_id=1).model_dump(),
    )
    data = r.json()
    assert r.status_code == 201
    assert data["id"] == id
    assert len(data["question_scores"]) == 1
    assert data["question_scores"][0]
    assert len(data["times"]) == 1


# =================
# == CREATE TEAM ==
# =================


def test_create_team_unauthenticated(client: TestClient) -> None:
    r = client.post(f"{settings.API_V1_STR}/team/", json={"name": "Test3"})
    assert r.status_code == 401


@pytest.mark.parametrize(
    "client",
    [{}, {"sub": 1}],
    indirect=["client"],
)
def test_create_team_not_admin(client: TestClient) -> None:
    r = client.post(f"{settings.API_V1_STR}/team/", json={"name": "Test3"})
    assert r.status_code == 403


@pytest.mark.parametrize(
    "client",
    [
        {"scopes": [ScopeEnum.ADMIN]},
        {"scopes": [ScopeEnum.MANAGER_RALLY]},
    ],
    indirect=["client"],
)
def test_create_team_admin(client: TestClient) -> None:
    r = client.post(f"{settings.API_V1_STR}/team/", json={"name": "Test3"})
    data = r.json()
    assert r.status_code == 201
    assert data["name"] == "Test3"


# =================
# == UPDATE TEAM ==
# =================


def test_update_team_unauthenticated(client: TestClient, db: Session) -> None:
    team = db.query(Team).first()
    assert team is not None
    id = team.id

    r = client.put(
        f"{settings.API_V1_STR}/team/{id}",
        json={
            "name": "Test1",
            "pukes": [0],
            "skips": [0],
            "time_scores": [100],
            "question_scores": [True],
            "times": ["2021-05-01T12:00:00"],
        },
    )
    assert r.status_code == 401


@pytest.mark.parametrize(
    "client",
    [{}, {"sub": 1}],
    indirect=["client"],
)
def test_update_team_not_admin(client: TestClient, db: Session) -> None:
    team = db.query(Team).first()
    assert team is not None
    id = team.id

    r = client.put(
        f"{settings.API_V1_STR}/team/{id}",
        json={
            "name": "Test1",
            "pukes": [0],
            "skips": [0],
            "time_scores": [100],
            "question_scores": [True],
            "times": ["2021-05-01T12:00:00"],
        },
    )
    assert r.status_code == 403


@pytest.mark.parametrize(
    "client",
    [
        {"scopes": [ScopeEnum.ADMIN]},
        {"scopes": [ScopeEnum.MANAGER_RALLY]},
    ],
    indirect=["client"],
)
def test_update_team_admin(client: TestClient, db: Session) -> None:
    team = db.query(Team).first()
    assert team is not None
    id = team.id

    r = client.put(
        f"{settings.API_V1_STR}/team/{id}",
        json={
            "name": "Test1",
            "pukes": [0],
            "skips": [0],
            "time_scores": [100],
            "question_scores": [True],
            "times": ["2021-05-01T12:00:00"],
        },
    )
    data = r.json()
    assert r.status_code == 200
    assert data["name"] == "Test1"
    assert data["pukes"] == [0]
    assert data["skips"] == [0]
    assert data["time_scores"] == [100]
    assert data["question_scores"] == [True]
    assert data["times"] == ["2021-05-01T12:00:00"]
