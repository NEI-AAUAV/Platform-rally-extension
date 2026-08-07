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
        assert result.is_redacted is False

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
        # Clients must not have to sniff the placeholder name to know this.
        assert result.is_redacted is True

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

    def test_arriving_reveals_a_post_that_is_not_completed_yet(self) -> None:
        # A post with an activity stays "current" until staff scores it. The
        # team is standing in front of it — withholding the name and photos
        # then makes arriving unrewarding, which is the whole game.
        checkpoint = _checkpoint(order=3)

        result = CheckpointService._redact_unreached(checkpoint, current_order=3, has_arrived=True)

        assert result == checkpoint
        assert result.is_redacted is False

    def test_not_arriving_keeps_the_current_post_redacted(self) -> None:
        checkpoint = _checkpoint(order=3)

        result = CheckpointService._redact_unreached(checkpoint, current_order=3, has_arrived=False)

        assert result.is_redacted is True

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

    def test_an_arrived_post_is_revealed_within_the_list(self) -> None:
        # given a team that checked in at post 2 but is still awaiting its
        # activity to be scored, so post 2 is still "current"
        checkpoints = [_checkpoint(order=1), _checkpoint(order=2), _checkpoint(order=3)]

        result = self._service()._redact_list(
            checkpoints,
            current_order=2,
            reveal_next=False,
            arrived_ids=frozenset({2}),
        )

        assert [cp.name for cp in result] == ["Ponte de Ferro", "Ponte de Ferro", "Posto 3"]
        assert result[1].latitude is not None
        # The post ahead is still a secret.
        assert result[2].latitude is None

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


class TestSearchArea:
    """The map circle for a redacted post."""

    def test_no_circle_when_the_radius_is_zero(self) -> None:
        result = CheckpointService._redact_unreached(
            _checkpoint(order=3), current_order=3, search_radius_m=0
        )

        assert result.search_latitude is None
        assert result.search_radius_m is None

    def test_the_circle_is_not_centred_on_the_post(self) -> None:
        checkpoint = _checkpoint(order=3)

        result = CheckpointService._redact_unreached(
            checkpoint, current_order=3, search_radius_m=400
        )

        # Centring it on the post would be the pin with extra steps.
        assert result.search_latitude != checkpoint.latitude
        assert result.search_longitude != checkpoint.longitude
        assert result.search_radius_m == 400

    def test_the_post_stays_inside_its_own_circle(self) -> None:
        from app.utils.geo import distance_m

        checkpoint = _checkpoint(order=3)
        result = CheckpointService._redact_unreached(
            checkpoint, current_order=3, search_radius_m=400
        )

        # A circle the post falls outside of would send teams to the wrong
        # neighbourhood entirely.
        offset = distance_m(
            result.search_latitude,
            result.search_longitude,
            checkpoint.latitude,
            checkpoint.longitude,
        )
        assert offset < 400

    def test_the_circle_does_not_move_between_requests(self) -> None:
        checkpoint = _checkpoint(order=3)

        first = CheckpointService._redact_unreached(
            checkpoint, current_order=3, search_radius_m=400
        )
        second = CheckpointService._redact_unreached(
            checkpoint, current_order=3, search_radius_m=400
        )

        # A circle that jittered per request could be averaged back to its
        # centre, which is the post.
        assert (first.search_latitude, first.search_longitude) == (
            second.search_latitude,
            second.search_longitude,
        )

    def test_different_posts_get_different_offsets(self) -> None:
        one = CheckpointService._redact_unreached(
            _checkpoint(order=3), current_order=3, search_radius_m=400
        )
        two = CheckpointService._redact_unreached(
            _checkpoint(order=4), current_order=3, search_radius_m=400
        )

        assert (one.search_latitude, one.search_longitude) != (
            two.search_latitude,
            two.search_longitude,
        )

    def test_a_revealed_post_gets_no_circle(self) -> None:
        result = CheckpointService._redact_unreached(
            _checkpoint(order=1), current_order=3, search_radius_m=400
        )

        # It has real coordinates now; a search circle would be noise.
        assert result.search_radius_m is None

    def test_a_post_without_coordinates_gets_no_circle(self) -> None:
        checkpoint = _checkpoint(order=3, latitude=None, longitude=None)

        result = CheckpointService._redact_unreached(
            checkpoint, current_order=3, search_radius_m=400
        )

        assert result.search_latitude is None
