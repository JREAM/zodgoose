export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow a [skip ci] suffix appended by semantic-release's own
    // chore(release): commits via commit-msg body/scope, not footer.
  },
};
