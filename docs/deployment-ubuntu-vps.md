# Deploying Hiddekel to an Ubuntu 24.04 VPS

This deployment uses GitHub as the source of updates, PostgreSQL on the VPS,
Nginx for HTTPS and static files, and systemd to keep the API running.
The app and database credentials stay on the VPS, not in GitHub.

## 1. Point the domain to the VPS

In Namecheap DNS, create A records for `@` and `www` pointing to the VPS public
IPv4 address. Allow time for DNS propagation. Do not expose PostgreSQL port 5432
or the API port 5000 to the public internet.

## 2. Install server packages

Connect to the VPS over SSH using your own account, then install Node.js 22
(Vite 8 requires a recent Node 20 or Node 22 release), PostgreSQL, Nginx, Git,
and Certbot. For example:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git postgresql postgresql-contrib nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

Confirm Node prints version 22.x before continuing.

## 3. Create the database

Create a dedicated database role and database. Use `\password` so the database
password is not typed into a shell command:

```bash
sudo -u postgres psql
```

At the `psql` prompt:

```sql
CREATE ROLE hiddekel_app LOGIN;
\password hiddekel_app
CREATE DATABASE hiddekel OWNER hiddekel_app;
\q
```

The app's runtime role should own the tables: migrations enable RLS without
policies, and PostgreSQL table owners bypass RLS unless `FORCE ROW LEVEL
SECURITY` is set. Keep PostgreSQL bound to localhost and do not grant this role
superuser privileges.

## 4. Create the app account and clone the repository

Create the dedicated deployment/service account and app directory:

```bash
sudo useradd --create-home --shell /bin/bash hiddekel
sudo install -d -o hiddekel -g hiddekel -m 0755 /opt/hiddekel-pharmacy
```

Clone the GitHub repository into the empty directory as `hiddekel`:

```bash
sudo -u hiddekel git clone https://github.com/joshuaonazi/HIDDEKEL-PHARMACY.git /opt/hiddekel-pharmacy
```

If the GitHub repository is private, configure a read-only GitHub deploy key
for this account and use the repository's SSH clone URL instead. Never put a
GitHub token in the repository or deployment script.

Apply the schema and migrations in order. `psql` will prompt for the
`hiddekel_app` password:

```bash
cd /opt/hiddekel-pharmacy
sudo -u hiddekel psql -h 127.0.0.1 -U hiddekel_app -d hiddekel -f database/schema.sql
sudo -u hiddekel psql -h 127.0.0.1 -U hiddekel_app -d hiddekel -f database/migrations/002_enable_rls.sql
sudo -u hiddekel psql -h 127.0.0.1 -U hiddekel_app -d hiddekel -f database/migrations/003_sales_checkout.sql
sudo -u hiddekel psql -h 127.0.0.1 -U hiddekel_app -d hiddekel -f database/migrations/004_user_management.sql
sudo -u hiddekel psql -h 127.0.0.1 -U hiddekel_app -d hiddekel -f database/migrations/005_prescriptions.sql
```

This initializes the database from the current schema and applies the
idempotent migrations. For an existing database with live data, take a backup
first and apply only migrations that have not already run; do not re-run
`schema.sql` over an existing production database.

## 5. Configure the API service

Create `/etc/hiddekel/hiddekel.env` with root ownership and mode `640`. Use
URL-safe hexadecimal secrets to avoid URL parsing issues:

```bash
sudo install -d -o root -g hiddekel -m 0750 /etc/hiddekel
sudo install -o root -g hiddekel -m 0640 /dev/null /etc/hiddekel/hiddekel.env
sudo nano /etc/hiddekel/hiddekel.env
```

Set these values in that file:

```ini
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://hiddekel_app:URL_SAFE_PASSWORD@127.0.0.1:5432/hiddekel
JWT_SECRET=GENERATE_A_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=12h
CLIENT_ORIGIN=https://hiddekkelpharmacy.com
TRUST_PROXY=1
```

Generate a JWT secret with `openssl rand -hex 48`. Keep both secrets private
and do not commit this file.

Install the systemd unit and allow the deployment account to restart only this
service:

```bash
sudo cp /opt/hiddekel-pharmacy/deploy/hiddekel-api.service.example /etc/systemd/system/hiddekel-api.service
sudo visudo -f /etc/sudoers.d/hiddekel-deploy
```

Add this line in the sudoers editor:

```text
hiddekel ALL=(root) NOPASSWD: /usr/bin/systemctl restart hiddekel-api
```

Then enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hiddekel-api
```

## 6. Build the client and configure Nginx

Run the deployment script once to install dependencies and build the frontend.
The script expects the checkout to be on `main` and up to date with GitHub:

```bash
sudo -u hiddekel bash /opt/hiddekel-pharmacy/deploy/deploy.sh
```

Install the Nginx site:

```bash
sudo cp /opt/hiddekel-pharmacy/deploy/nginx.conf.example /etc/nginx/sites-available/hiddekel
sudo ln -s /etc/nginx/sites-available/hiddekel /etc/nginx/sites-enabled/hiddekel
sudo nginx -t
sudo systemctl reload nginx
```

Once both DNS records resolve to the VPS, issue the HTTPS certificate:

```bash
sudo certbot --nginx -d hiddekkelpharmacy.com -d www.hiddekkelpharmacy.com
```

Choose the option to redirect HTTP to HTTPS. Ensure firewall rules allow SSH,
HTTP, and HTTPS only:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 7. Create the first admin user

The seed command requires `PHARMACY_NAME`, `ADMIN_NAME`, `ADMIN_EMAIL`, and
`ADMIN_PASSWORD`. Temporarily add those four values to the app environment file,
then run:

```bash
sudo -u hiddekel bash -c 'set -a; source /etc/hiddekel/hiddekel.env; set +a; cd /opt/hiddekel-pharmacy/server && npm run seed'
```

Remove the temporary `ADMIN_*` values from the environment file immediately
after a successful seed. Use a strong, unique password.

## 8. Enable automatic deployment from GitHub

The workflow at `.github/workflows/deploy.yml` runs for each push to `main`.
It SSHes to the VPS as the `hiddekel` account and runs the deployment script.
Before enabling it, fix the VPS `sudoers_audit` problem, complete the setup
above, and confirm the following work from your machine:

```bash
ssh hiddekel@hiddekkelpharmacy.com
sudo -n /usr/bin/systemctl restart hiddekel-api
```

In the GitHub repository, open **Settings → Secrets and variables → Actions**
and add these repository secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS public IP or SSH hostname |
| `VPS_USER` | `hiddekel` |
| `VPS_SSH_PORT` | SSH port (optional; defaults to `22`) |
| `VPS_SSH_KEY` | Private half of a dedicated SSH deploy key |
| `VPS_KNOWN_HOSTS` | Verified SSH host-key line for the VPS |

Generate a dedicated Ed25519 key pair on your own machine. Add its **public
key** to `/home/hiddekel/.ssh/authorized_keys` on the VPS and save its **private
key** as `VPS_SSH_KEY` in GitHub Actions secrets. Never commit either key. If
the repository is private, the VPS also needs its own read-only GitHub deploy
key so `git fetch` can access the repository.

Obtain the VPS host key line with `ssh-keyscan`, then verify its fingerprint
against the SSH host key shown from the VPS console before saving it as
`VPS_KNOWN_HOSTS`. Do not disable SSH host-key checking.

The workflow does not run database migrations. Apply any required migration
manually, with a backup, before deploying code that depends on it.

## 9. Publish subsequent updates

After automatic deployment is configured, commit and push changes to the GitHub
`main` branch. GitHub Actions will deploy the update. To deploy manually instead:

```bash
sudo -u hiddekel bash /opt/hiddekel-pharmacy/deploy/deploy.sh
```

The script fast-forwards the VPS checkout, installs locked dependencies,
builds the client, restarts the API, and checks `/api/health`. If it fails,
inspect the service with:

```bash
sudo journalctl -u hiddekel-api -n 80 --no-pager
sudo systemctl status hiddekel-api --no-pager
```

Keep regular off-VPS PostgreSQL backups before storing real pharmacy data.
