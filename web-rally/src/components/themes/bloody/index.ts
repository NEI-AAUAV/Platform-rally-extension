// Back-compat shim: the bloody skin is collapsed into the unified rally set.
// Existing deep imports (`BloodyButton`, etc.) keep working; new code should
// import from `@/components/themes` or `../rally` directly.
export {
  RallyButton as BloodyButton,
  RallyBadge as BloodyBadge,
  RallyScore as BloodyScore,
  RallyCard as BloodyCard,
  RallyInteractiveCard as BloodyInteractiveCard,
  RallyBlood as BloodyBlood,
  rallyBackground as bloodyBackground,
  rallyConfig as bloodyConfig,
  type ThemeConfig,
} from "../rally";
