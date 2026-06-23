// Demo-mode flag, baked in at build time on the separate demo deployment via
// NEXT_PUBLIC_DEMO_MODE=1 (see deploy/deploy.sh). The real app builds without it,
// so all demo affordances tree-shake to `false` there.
export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === '1' ||
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
