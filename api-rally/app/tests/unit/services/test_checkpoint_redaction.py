"""Unit tests for the checkpoint redactor — no DB, no session.

The DB-backed visibility matrix (public vs team vs admin, route modes) is
covered against a real Postgres in app/tests/api/test_checkpoint_visibility.py.
What lives here is the rule that decides *what survives* redaction, which is
the whole point of peddy paper mode: a team must receive the riddle and
nothing that answers it.
"""

from app.schemas.checkpoint import DetailedCheckPoint
from app.services.checkpoint_service import CheckpointService


def _checkpoint(order: int, **overrides: object) -> DetailedCheckPoint:
    fields: dict[str, object] = {
        "id": order,
        "name": "Ponte de Ferro",
        "description": "O sítio onde o rally começou em 2019.",
        "latitude": 40.640_5,
        "longitude": -8.653_8,
        "order": order,
        "arrival_radius_m": 50,
        "clue": "Onde o rio encontra a ponte de ferro.",
        "clue_media_url": "https://cdn.example/enigma-3.jpg",
    }
    fields.update(overrides)
    return DetailedCheckPoint(**fields)  # type: ignore[arg-type]


class TestRedactUnreached:
    def test_completed_checkpoint_passes_through_untouched(self) -> None:
        # given a post the team already checked into
        checkpoint = _checkpoint(order=1)

        # when
        result = CheckpointService._redact_unreached(checkpoint, current_order=3)

        # then reaching it *is* the reward: it keeps its real name and coords
        assert result == checkpoint

    def test_current_checkpoint_loses_name_description_and_coordinates(self) -> None:
        # given the post the team is currently hunting
        checkpoint = _checkpoint(order=3)

        # when
        result = CheckpointService._redact_unreached(checkpoint, current_order=3)

        # then nothing that identifies the location survives
        assert result.name == "Posto 3"
        assert result.latitude is None
        assert result.longitude is None
        assert "2019" not in (result.description or "")

    def test_clue_survives_redaction(self) -> None:
        # given a post with a participant riddle
        checkpoint = _checkpoint(order=3)

        # when
        result = CheckpointService._redact_unreached(checkpoint, current_order=3)

        # then the riddle is the one thing the team is meant to have, and it is
        # mirrored into description for clients that only render that field
        assert result.clue == "Onde o rio encontra a ponte de ferro."
        assert result.clue_media_url == "https://cdn.example/enigma-3.jpg"
        assert result.description == "Onde o rio encontra a ponte de ferro."

    def test_clueless_checkpoint_redacts_to_an_empty_description(self) -> None:
        # given a guided event, where the guide reads indications on arrival
        checkpoint = _checkpoint(order=2, clue=None, clue_media_url=None)

        # when
        result = CheckpointService._redact_unreached(checkpoint, current_order=2)

        # then the card shows no riddle rather than a stale description
        assert result.clue is None
        assert result.description is None

    def test_future_checkpoints_are_redacted_too(self) -> None:
        # given a post beyond the one the team is hunting
        checkpoint = _checkpoint(order=5)

        # when
        result = CheckpointService._redact_unreached(checkpoint, current_order=3)

        # then it is redacted on the same terms — order alone is public
        assert result.name == "Posto 5"
        assert result.latitude is None
        assert result.order == 5


class TestRedactList:
    def _service(self) -> CheckpointService:
        # The list redactor touches neither the session nor the CRUDs.
        return CheckpointService(db=None, checkpoint_crud=None, team_crud=None)  # type: ignore[arg-type]

    def test_reveal_on_returns_every_checkpoint_intact(self) -> None:
        # given a rally, where the next stop is public knowledge
        checkpoints = [_checkpoint(order=1), _checkpoint(order=2)]

        # when
        result = self._service()._redact_list(checkpoints, current_order=1, reveal_next=True)

        # then
        assert [cp.name for cp in result] == ["Ponte de Ferro", "Ponte de Ferro"]
        assert all(cp.latitude is not None for cp in result)

    def test_reveal_off_splits_the_list_at_the_team_position(self) -> None:
        # given a peddy paper with one post completed
        checkpoints = [_checkpoint(order=1), _checkpoint(order=2), _checkpoint(order=3)]

        # when
        result = self._service()._redact_list(checkpoints, current_order=2, reveal_next=False)

        # then completed posts stay whole, everything from the current one on is redacted
        assert [cp.name for cp in result] == ["Ponte de Ferro", "Posto 2", "Posto 3"]
        assert result[0].latitude is not None
        assert result[1].latitude is None
        assert result[2].latitude is None
