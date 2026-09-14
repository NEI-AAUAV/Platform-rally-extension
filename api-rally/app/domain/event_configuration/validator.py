from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Any

from app.domain.event_configuration.policies import (
    SETTING_CAPABILITIES,
    Capability,
    CapabilityPolicy,
    EventProfile,
)
from app.domain.event_configuration.resolver import (
    EffectiveCapability,
    is_rotation_schedule_valid_structure,
    resolve_capabilities,
)
from app.services.checkpoint_planning import missing_fields


class ConfigurationIssueSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


@dataclass(frozen=True)
class ConfigurationIssue:
    code: str
    severity: ConfigurationIssueSeverity
    message: str
    fields: list[str] | None = None
    entity_type: str | None = None
    entity_ids: list[int] | None = None
    suggestion: str | None = None
    autofix: str | None = None


@dataclass(frozen=True)
class ConfigurationReport:
    event_type: str
    event_profile: str
    capabilities: dict[str, dict[str, Any]]
    issues: list[ConfigurationIssue]

    @property
    def ready(self) -> bool:
        return not any(i.severity is ConfigurationIssueSeverity.ERROR for i in self.issues)


class ConfigurationValidator:
    @staticmethod
    def local_issues(
        *,
        event_type: str,
        profile: str | None,
        settings: object,
        config: dict[str, Any] | None = None,
    ) -> list[ConfigurationIssue]:
        caps = resolve_capabilities(
            event_type=event_type,
            profile=profile,
            settings=settings,
            platform_qr_supported=True,
            event_config=config,
        )
        issues: list[ConfigurationIssue] = []
        if getattr(settings, "compass_enabled", False) and not getattr(
            settings, "proximity_enabled", False
        ):
            issues.append(
                ConfigurationIssue(
                    "COMPASS_REQUIRES_PROXIMITY",
                    ConfigurationIssueSeverity.ERROR,
                    "A bússola necessita da funcionalidade de proximidade.",
                    ["compass_enabled", "proximity_enabled"],
                    autofix="activate_proximity",
                )
            )
        if getattr(settings, "guide_mode_active", False) and not getattr(
            settings, "guide_mode_enabled", False
        ):
            issues.append(
                ConfigurationIssue(
                    "GUIDE_ACTIVE_REQUIRES_GUIDE_ENABLED",
                    ConfigurationIssueSeverity.ERROR,
                    "O modo guia ativo requer que o modo guia esteja ativado.",
                    ["guide_mode_active", "guide_mode_enabled"],
                    autofix="enable_guide_mode",
                )
            )
        for cap, value in caps.items():
            # Derived artefacts are checked by full preflight with event data,
            # not by local settings validation.
            if cap is Capability.OLYMPIC_ROTATION:
                continue
            if value.policy is CapabilityPolicy.REQUIRED and not value.configured:
                issues.append(
                    ConfigurationIssue(
                        "REQUIRED_CAPABILITY_DISABLED",
                        ConfigurationIssueSeverity.ERROR,
                        f"A capability obrigatória '{cap.value}' está desligada.",
                        [SETTING_FIELDS.get(cap, cap.value)],
                    )
                )
            if value.policy is CapabilityPolicy.FORBIDDEN and value.configured:
                issues.append(
                    ConfigurationIssue(
                        "FORBIDDEN_CAPABILITY_ENABLED",
                        ConfigurationIssueSeverity.ERROR,
                        f"A capability '{cap.value}' não está disponível neste perfil.",
                        [SETTING_FIELDS.get(cap, cap.value)],
                    )
                )
        if caps[Capability.GUIDE_MODE].policy is CapabilityPolicy.REQUIRED and not getattr(
            settings, "guide_mode_active", False
        ):
            issues.append(
                ConfigurationIssue(
                    "REQUIRED_CAPABILITY_DISABLED",
                    ConfigurationIssueSeverity.ERROR,
                    "O modo guia é obrigatório neste perfil e tem de estar ativo.",
                    ["guide_mode_active"],
                )
            )
        return issues

    @classmethod
    def _validate_rotation(
        cls,
        event: object,
        teams: Sequence[object] | None,
        checkpoints: Sequence[object],
        issues: list[ConfigurationIssue],
    ) -> None:
        schedule = getattr(event, "rotation_schedule", None)
        if not schedule:
            issues.append(
                ConfigurationIssue(
                    "ROTATION_SCHEDULE_MISSING",
                    ConfigurationIssueSeverity.ERROR,
                    "O perfil de rotação requer um calendário de rotações válido.",
                    ["rotation_schedule"],
                )
            )
            return
        if not is_rotation_schedule_valid_structure(schedule):
            issues.append(
                ConfigurationIssue(
                    "ROTATION_SCHEDULE_INVALID",
                    ConfigurationIssueSeverity.ERROR,
                    "O formato do calendário de rotações é inválido.",
                    ["rotation_schedule"],
                )
            )
            return
        team_ids = {getattr(t, "id", None) for t in (teams or [])}
        checkpoint_ids = {getattr(c, "id", None) for c in checkpoints}
        for round_ in schedule:
            for entry in round_:
                if (
                    entry.get("team_id") not in team_ids
                    or entry.get("checkpoint_id") not in checkpoint_ids
                ):
                    issues.append(
                        ConfigurationIssue(
                            "ROTATION_SCHEDULE_STALE",
                            ConfigurationIssueSeverity.ERROR,
                            "O calendário de rotações referencia equipas ou postos "
                            "que já não existem.",
                            ["rotation_schedule"],
                        )
                    )
                    return

    @classmethod
    def _validate_coordinates(
        cls,
        caps: dict[Capability, EffectiveCapability],
        checkpoints: Sequence[object],
        issues: list[ConfigurationIssue],
    ) -> None:
        needs_coordinates = (
            caps[Capability.GPS_ARRIVAL].effective or caps[Capability.PROXIMITY].effective
        )
        if not needs_coordinates:
            return
        bad = [
            c
            for c in checkpoints
            if getattr(c, "latitude", None) is None
            or getattr(c, "longitude", None) is None
            or not isinstance(getattr(c, "arrival_radius_m", None), int)
            or getattr(c, "arrival_radius_m", 0) <= 0
        ]
        if bad:
            bad_ids = [c_id for c in bad if isinstance((c_id := getattr(c, "id", None)), int)]
            issues.append(
                ConfigurationIssue(
                    "GPS_CHECKPOINT_MISSING_COORDINATES",
                    ConfigurationIssueSeverity.ERROR,
                    f"{len(bad)} postos não têm coordenadas GPS ou raio de chegada válido.",
                    ["latitude", "longitude", "arrival_radius_m"],
                    "checkpoint",
                    bad_ids,
                    "Configure coordenadas e um raio de chegada em cada posto.",
                )
            )

    @classmethod
    def _validate_guide_coverage(
        cls,
        teams: Sequence[object] | None,
        guide_assignments: Sequence[object] | None,
        issues: list[ConfigurationIssue],
    ) -> None:
        """Existence of *some* guide assignment (NO_GUIDE_ASSIGNMENTS) doesn't
        mean every team has one. Only checked once at least one assignment
        and one team exist — the zero-assignments case is its own, more
        urgent issue and shouldn't also be reported as "N teams missing".
        """
        if not teams or not guide_assignments:
            return
        assigned_team_ids = {getattr(a, "team_id", None) for a in guide_assignments}
        unassigned = [
            t_id
            for t in teams
            if isinstance((t_id := getattr(t, "id", None)), int) and t_id not in assigned_team_ids
        ]
        if unassigned:
            issues.append(
                ConfigurationIssue(
                    "UNASSIGNED_GUIDE_TEAMS",
                    ConfigurationIssueSeverity.WARNING,
                    f"{len(unassigned)} equipa(s) sem guia atribuído.",
                    entity_type="team",
                    entity_ids=unassigned,
                    suggestion="Atribua um guia a cada equipa em Guias.",
                )
            )

    @classmethod
    def _validate_staff_coverage(
        cls,
        checkpoints: Sequence[object],
        staff_assignments: Sequence[object] | None,
        issues: list[ConfigurationIssue],
    ) -> None:
        """Mirrors _validate_guide_coverage for staff: existence of some
        assignment doesn't mean every published checkpoint is staffed.
        """
        if not checkpoints or not staff_assignments:
            return
        staffed_checkpoint_ids = {getattr(a, "checkpoint_id", None) for a in staff_assignments}
        unstaffed = [
            c_id
            for c in checkpoints
            if isinstance((c_id := getattr(c, "id", None)), int)
            and c_id not in staffed_checkpoint_ids
        ]
        if unstaffed:
            issues.append(
                ConfigurationIssue(
                    "UNSTAFFED_CHECKPOINTS",
                    ConfigurationIssueSeverity.WARNING,
                    f"{len(unstaffed)} posto(s) publicado(s) sem staff atribuído.",
                    entity_type="checkpoint",
                    entity_ids=unstaffed,
                    suggestion="Atribua staff a cada posto em Atribuições.",
                )
            )

    @classmethod
    def _validate_checkpoint_completeness(
        cls,
        checkpoints: Sequence[object],
        activities: Sequence[object] | None,
        staff_assignments: Sequence[object] | None,
        settings: object,
        issues: list[ConfigurationIssue],
    ) -> None:
        """Surfaces the same per-checkpoint completeness the admin planning
        view (RouteStatus/AdminCheckPoint.missing) already computes via
        ``missing_fields`` — reused here, not reimplemented, so the two
        views can never drift apart.
        """
        if not checkpoints:
            return
        activity_ids = {getattr(a, "checkpoint_id", None) for a in (activities or [])}
        staffed_ids = {getattr(a, "checkpoint_id", None) for a in (staff_assignments or [])}
        requires_coordinates = bool(getattr(settings, "gps_checkin_enabled", False))
        requires_clue = not getattr(settings, "reveal_next_checkpoint", True)
        requires_stage = bool(getattr(settings, "route_stages_enabled", False))
        incomplete_ids = [
            c_id
            for c in checkpoints
            if missing_fields(
                c,
                has_activity=getattr(c, "id", None) in activity_ids,
                has_staff=getattr(c, "id", None) in staffed_ids,
                requires_coordinates=requires_coordinates,
                requires_clue=requires_clue,
                requires_stage=requires_stage,
            )
            and (c_id := getattr(c, "id", None)) is not None
        ]
        if incomplete_ids:
            issues.append(
                ConfigurationIssue(
                    "INCOMPLETE_PUBLISHED_CHECKPOINTS",
                    ConfigurationIssueSeverity.WARNING,
                    f"{len(incomplete_ids)} posto(s) publicado(s) têm campos em falta.",
                    entity_type="checkpoint",
                    entity_ids=incomplete_ids,
                    suggestion="Reveja os postos assinalados na gestão de Postos.",
                )
            )

    @classmethod
    def _validate_event_dates(cls, event: object, issues: list[ConfigurationIssue]) -> None:
        start_time = getattr(event, "start_time", None)
        end_time = getattr(event, "end_time", None)
        if start_time is not None and end_time is not None and end_time <= start_time:
            issues.append(
                ConfigurationIssue(
                    "EVENT_DATES_INVALID",
                    ConfigurationIssueSeverity.ERROR,
                    "A data de fim do evento não pode ser anterior ou igual à data de início.",
                    ["start_time", "end_time"],
                    suggestion="Corrija as datas do evento em Edições.",
                )
            )

    @classmethod
    def _validate_playable_basics(
        cls,
        event_type: str,
        checkpoints: Sequence[object],
        teams: Sequence[object] | None,
        issues: list[ConfigurationIssue],
    ) -> None:
        if event_type not in {"peddy_paper", "rally_tascas", "olympic"}:
            return
        if not checkpoints:
            issues.append(
                ConfigurationIssue(
                    "NO_CHECKPOINTS",
                    ConfigurationIssueSeverity.ERROR,
                    "Este perfil necessita de pelo menos um posto publicado para poder ser jogado.",
                    entity_type="checkpoint",
                    suggestion="Crie e publique pelo menos um posto no percurso.",
                )
            )
        if not teams:
            issues.append(
                ConfigurationIssue(
                    "NO_TEAMS",
                    ConfigurationIssueSeverity.WARNING,
                    "Ainda não existem equipas registadas.",
                    entity_type="team",
                    suggestion="Registe pelo menos uma equipa antes do evento começar.",
                )
            )

    @classmethod
    def validate(
        cls,
        *,
        event: object,
        settings: object,
        checkpoints: Sequence[object],
        route_stages: Sequence[object],
        platform_qr_supported: bool,
        activities: Sequence[object] | None = None,
        staff_assignments: Sequence[object] | None = None,
        guide_assignments: Sequence[object] | None = None,
        teams: Sequence[object] | None = None,
    ) -> ConfigurationReport:
        event_type = getattr(event, "event_type", "")
        profile = getattr(event, "event_profile", "custom")
        config = getattr(event, "config", {})
        caps = resolve_capabilities(
            event_type=event_type,
            profile=profile,
            settings=settings,
            platform_qr_supported=platform_qr_supported,
            event_config=config,
            rotation_schedule=getattr(event, "rotation_schedule", None),
        )
        issues = cls.local_issues(
            event_type=event_type, profile=profile, settings=settings, config=config
        )
        autonomous = event_type == "peddy_paper" and profile == EventProfile.AUTONOMOUS.value
        guided = event_type == "peddy_paper" and profile == EventProfile.GUIDED.value
        arrivals = [Capability.GPS_ARRIVAL, Capability.QR_ARRIVAL] + (
            [Capability.GUIDE_ARRIVAL] if guided else []
        )
        if (autonomous or guided) and not any(caps[c].effective for c in arrivals):
            issues.append(
                ConfigurationIssue(
                    "NO_ARRIVAL_METHOD",
                    ConfigurationIssueSeverity.ERROR,
                    "Este perfil requer pelo menos um método operacional de chegada.",
                    [c.value for c in arrivals],
                )
            )
        cls._validate_event_dates(event, issues)
        cls._validate_playable_basics(event_type, checkpoints, teams, issues)
        cls._validate_checkpoint_completeness(
            checkpoints, activities, staff_assignments, settings, issues
        )
        if event_type == "olympic" and profile == EventProfile.ROTATION.value:
            cls._validate_rotation(event, teams, checkpoints, issues)
        if caps[Capability.STAFF_SCORING].policy is CapabilityPolicy.REQUIRED:
            if not activities:
                issues.append(
                    ConfigurationIssue(
                        "NO_ACTIVITIES",
                        ConfigurationIssueSeverity.ERROR,
                        "A avaliação por staff requer pelo menos uma atividade.",
                        entity_type="activity",
                    )
                )
            if not staff_assignments:
                issues.append(
                    ConfigurationIssue(
                        "NO_STAFF_ASSIGNMENTS",
                        ConfigurationIssueSeverity.ERROR,
                        "A avaliação por staff requer pelo menos uma atribuição de staff.",
                        entity_type="staff_assignment",
                    )
                )
            else:
                cls._validate_staff_coverage(checkpoints, staff_assignments, issues)
        if caps[Capability.GUIDE_MODE].policy is CapabilityPolicy.REQUIRED:
            if not guide_assignments:
                issues.append(
                    ConfigurationIssue(
                        "NO_GUIDE_ASSIGNMENTS",
                        ConfigurationIssueSeverity.ERROR,
                        "O perfil guiado requer pelo menos uma atribuição de guia.",
                        entity_type="guide_assignment",
                    )
                )
            else:
                cls._validate_guide_coverage(teams, guide_assignments, issues)
        if (
            event_type == "peddy_paper"
            and not caps[Capability.HINTS].effective
            and not caps[Capability.SKIP].effective
        ):
            issues.append(
                ConfigurationIssue(
                    "NO_RECOVERY_PATH",
                    ConfigurationIssueSeverity.WARNING,
                    "Pistas e desistência estão desligadas. Uma equipa bloqueada poderá não "
                    "conseguir continuar.",
                    ["hints_enabled", "skip_enabled"],
                )
            )
        if caps[Capability.QR_ARRIVAL].configured and not platform_qr_supported:
            issues.append(
                ConfigurationIssue(
                    "QR_UNAVAILABLE_ON_PLATFORM",
                    ConfigurationIssueSeverity.ERROR,
                    "Este evento usa check-in QR, mas SELF_CHECKIN_ENABLED=false no servidor.",
                    ["qr_checkin_enabled"],
                )
            )
        cls._validate_coordinates(caps, checkpoints, issues)
        if caps[Capability.ROUTE_STAGES].effective and not route_stages:
            issues.append(
                ConfigurationIssue(
                    "NO_ROUTE_STAGES",
                    ConfigurationIssueSeverity.WARNING,
                    "Route stages está ativo, mas não existem etapas configuradas.",
                    ["route_stages_enabled"],
                )
            )
        if (
            caps[Capability.LEG_TIME_SCORING].effective
            and getattr(settings, "leg_time_points_per_minute", 0) == 0
        ):
            issues.append(
                ConfigurationIssue(
                    "LEG_TIME_SCORING_ZERO_POINTS",
                    ConfigurationIssueSeverity.WARNING,
                    "Leg-time scoring está ativo mas atribui 0 pontos por minuto.",
                    ["leg_time_points_per_minute"],
                )
            )
        serial = {
            c.value: {
                "policy": v.policy.value,
                "configured": v.configured,
                "available": v.available,
                "effective": v.effective,
            }
            for c, v in caps.items()
        }
        return ConfigurationReport(event_type, profile, serial, issues)


SETTING_FIELDS = {
    capability: field for capability, (field, _inverted) in SETTING_CAPABILITIES.items()
}
