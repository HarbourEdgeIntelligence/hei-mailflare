/**
 * HEI fork: upstream is merged by hand, because the update workflow would replace
 * the fork's own changes. This switches off the admin update endpoints, the
 * auto-update cron and the update check on the admin card.
 */
export const SELF_UPDATE_ENABLED = false;
