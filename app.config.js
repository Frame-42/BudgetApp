/**
 * app.json plus the per-developer signing team. The team comes from
 * APPLE_TEAM_ID (put it in the git-ignored .env.local) so the repo doesn't
 * pin everyone to one Apple account; left unset, `expo run:ios` picks a team
 * itself.
 */
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
  },
});
