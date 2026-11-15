# Security

This is a personal, non-commercial hobby project shared as-is (see [LICENSE](LICENSE)). It has not been
security audited, and there is no support or maintenance commitment. Run it at your own risk.

## Know before you run it

- **No authentication.** The dashboard has no password. Anyone who can reach the port can view and
  control your SmartThings devices.
- **Never expose it to the internet.** Do not port-forward it, put it behind a public reverse proxy
  or tunnel, or bind it to a public IP. Keep it on a trusted home network only.
- **Tokens are stored in plain text.** Your SmartThings OAuth tokens are saved in `data/tokens.json`.
  Anyone with access to that file can control your devices. Keep the `data` folder private
  (restrict file permissions, don't commit it, don't include it in shared backups).
- **If you think a token leaked,** click ⚙ → Disconnect in the app, and revoke the app's access in your
  SmartThings / Samsung account (or delete the OAuth app with the SmartThings CLI).
- **Container hardening.** The image runs as a non-root user (uid 10001). Keep it updated
  (`git pull` then `docker compose up -d --build`) to pick up dependency and base-image fixes.

## Reporting a vulnerability

Please open a GitHub issue, or contact the maintainer privately if the report is sensitive. Fixes are
best-effort and there is no guaranteed response time.
