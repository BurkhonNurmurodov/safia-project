# Zero-downtime deploys for production.safiacorporate.uz — one-time root step

**Server:** 185.74.5.198 · **Time needed:** about 10 minutes · **Site stays up throughout.**

## Why

Each backend deploy restarts the dashboard's only process
(`safia-production.service`, port 8030). Until it has booted again, nginx has
nothing to send requests to, and users get Cloudflare's «502 Bad gateway» page.

After this step the app runs as two copies: `safia-production@8030` and
`@8031`. A deploy starts the new copy next to the old one and waits until it is
healthy. Only then does it stop the old copy. nginx sends requests to whichever
copy answers, so users never see a gap.

## What to run

Both commands must run as root:

```bash
sudo bash /var/www/production/deploy/03-bluegreen-setup.sh --check
```

`--check` changes nothing. It confirms the files, nginx, the certificate, ports
8030/8031, the running app version and the sudoers file. If it ends with
**«All checks passed»**, apply:

```bash
sudo bash /var/www/production/deploy/03-bluegreen-setup.sh
```

## What the script changes

| File / unit | Change |
|---|---|
| `/etc/sudoers.d/safia-production-deploy` | The deploy user (`user`) may start, stop, enable and disable `safia-production@8030` and `@8031`, on exact commands only. Checked with `visudo -c` before and after. |
| `/etc/systemd/system/safia-production@.service` | New template for the two copies. It uses the same user, directory, `.env` and venv as today. |
| `/etc/nginx/sites-available/production.safiacorporate.uz` | Both ports go in one upstream. A copy that is down is skipped. If neither copy answers, nginx serves the app's own page files from `frontend/dist`. `nginx -t` runs before the reload, and a failure restores the previous file. |
| `safia-production.service` | Stopped and disabled, but **only after** the copy on 8031 is healthy. The unit file stays, so the change can be undone. |

The previous nginx and sudoers files are saved to
`/root/safia-bluegreen-backup-<timestamp>/`.

## If something goes wrong

- The script stops at the first problem and says what it has left in place. The
  old service is never stopped before the new copy is healthy, so the site does
  not go down.
- To put everything back:

  ```bash
  sudo bash /var/www/production/deploy/03-bluegreen-setup.sh --undo
  ```

## Afterwards

Nothing else is needed. Deploys run through the existing Gitea pipeline
(`deploy/deploy.sh`) with no root access.

Useful commands:

```bash
systemctl status 'safia-production@*'
journalctl -u safia-production@8030 -u safia-production@8031 -f
```
