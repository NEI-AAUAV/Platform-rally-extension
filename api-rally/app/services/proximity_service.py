"""Hot/cold proximity, and an optional coarse bearing.

A team that does not know the city can be metres from a post and have no idea.
This tells them whether they are getting warmer, without ever sending a
coordinate.

The two deliberate limits, both about not handing over the answer:

* **Distance is bucketed**, reusing the same bands as a rejected arrival. A
  precise metre count read from a few positions trilaterates the post exactly;
  the coarse bands leave a disc roughly the size of the innermost band.
* **The bearing is only offered once the team is already at the post**
  (inside the closest band) and only as one of 8 sectors. A precise bearing
  taken from two places is a pair of lines that cross on the answer, which is
  strictly worse than distance. Inside the closest band the puzzle is already
  solved and the compass only helps find the doorway.
"""

import math
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RallyNotFoundError, RallyValidationError
from app.crud.crud_checkpoint import CRUDCheckPoint
from app.crud.crud_rally_settings import rally_settings
from app.crud.crud_team import CRUDTeam
from app.schemas.proximity import ProximityReading
from app.services.checkin_service import require_same_event
from app.services.checkpoint_arrival_service import _DISTANCE_BUCKETS, _distance_bucket
from app.services.team_service import is_checkpoint_reachable
from app.utils.geo import distance_m

PROXIMITY_DISABLED = "The proximity check is not enabled for this event"
NOT_CURRENT_CHECKPOINT = "You can only check your distance to the checkpoint you are heading to"
NO_COORDINATES = "Checkpoint has no GPS coordinates"

# The innermost band's upper bound: inside this, a team is close enough that
# the compass reveals nothing they have not already worked out.
_COMPASS_BAND_M = _DISTANCE_BUCKETS[0][0]

_SECTORS = ("N", "NE", "E", "SE", "S", "SO", "O", "NO")


def bearing_sector(*, from_lat: float, from_lon: float, to_lat: float, to_lon: float) -> str:
    """Compass direction as one of 8 sectors, never as degrees.

    45°-wide sectors are deliberate: a degree-accurate bearing from two
    positions pinpoints the target, a sector does not.
    """
    lat1, lat2 = math.radians(from_lat), math.radians(to_lat)
    delta_lon = math.radians(to_lon - from_lon)
    y = math.sin(delta_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(delta_lon)
    degrees = (math.degrees(math.atan2(y, x)) + 360) % 360
    return _SECTORS[round(degrees / 45) % 8]


class ProximityService:
    """Answers "am I getting warmer?" without leaking where the post is."""

    def __init__(self, db: AsyncSession, checkpoint_crud: CRUDCheckPoint, team_crud: CRUDTeam):
        self._db = db
        self._checkpoint_crud = checkpoint_crud
        self._team_crud = team_crud

    async def read(
        self, *, team_id: int, checkpoint_id: int, latitude: float, longitude: float
    ) -> ProximityReading:
        settings = await rally_settings.get_or_create(self._db)
        if not getattr(settings, "proximity_enabled", False):
            raise RallyValidationError(PROXIMITY_DISABLED)

        checkpoint = await self._checkpoint_crud.get(db=self._db, id=checkpoint_id)
        if checkpoint is None:
            raise RallyNotFoundError("Checkpoint not found")
        team = await self._team_crud.get(db=self._db, id=team_id)
        if team is None:
            raise RallyNotFoundError("Team not found")

        require_same_event(team.event_id, checkpoint.event_id)

        if not is_checkpoint_reachable(
            checkpoint_order=checkpoint.order,
            times_reached=len(team.times),
            order_matters=bool(settings.checkpoint_order_matters),
        ):
            # Sampling distance to a post further down the route would let a
            # team map the whole thing from the start line.
            raise RallyValidationError(NOT_CURRENT_CHECKPOINT)

        if checkpoint.latitude is None or checkpoint.longitude is None:
            raise RallyValidationError(NO_COORDINATES)

        dist = distance_m(latitude, longitude, checkpoint.latitude, checkpoint.longitude)
        is_closest_band = dist < _COMPASS_BAND_M

        direction: str | None = None
        if is_closest_band and getattr(settings, "compass_enabled", False):
            direction = bearing_sector(
                from_lat=latitude,
                from_lon=longitude,
                to_lat=checkpoint.latitude,
                to_lon=checkpoint.longitude,
            )

        return ProximityReading(
            checkpoint_id=checkpoint_id,
            band=_distance_bucket(dist),
            is_within_radius=dist <= checkpoint.arrival_radius_m,
            direction=direction,
        )


def proximity_settings_snapshot(settings: Any) -> dict[str, bool]:
    """What the client needs to know about the feature without a reading."""
    return {
        "proximity_enabled": bool(getattr(settings, "proximity_enabled", False)),
        "compass_enabled": bool(getattr(settings, "compass_enabled", False)),
    }
