# Install Num on a server

**Warning:** Num has no login, no users and no tokens. A person who can reach the port can read and change the book.
Run Num on a private network. Do not open the port to the LAN or to the internet.
Put an authenticating proxy in front of all remote access, MCP included.

This guide installs Num as a systemd service on Linux. The commands are for Fedora. Other distributions use the same
steps with their own package manager. The last section gives Cloudflare Tunnel and Cloudflare Access as one example
of the proxy. Num does not require Cloudflare.

Replace these values in the commands:

| Value | Meaning |
|---|---|
| `<user>` | Your login on the server. It builds the releases. |
| `<repo>` | The Git URL of your clone of Num. |
| `<port>` | The port of Num, for example `5457`. |

## Layout

| Path | Contents |
|---|---|
| `~/projects/num` | A clone of the repository. Only the deploy script uses it. |
| `/srv/num/releases/<commit>` | One built release for each deploy. The script keeps the last 5. |
| `/srv/num/current` | A symbolic link to the live release. |
| `/var/lib/num` | The data directory: `num.sqlite` and its WAL file. |

The service runs as the system user `num`. It cannot read home directories.

## 1. Install Bun and Git

```sh
sudo dnf install -y git unzip
curl -fsSL https://bun.sh/install | sudo BUN_INSTALL=/usr/local bash
/usr/local/bin/bun --version
```

Use the same Bun version as your development computer. To install one version, add `-s "bun-v<version>"` after `bash`.
The service uses `/usr/local/bin/bun`. A Bun in your home directory is not available to the service.

## 2. Make the user and the folders

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin num
sudo mkdir -p /srv/num/releases
sudo chown -R "$USER": /srv/num
git clone <repo> ~/projects/num
```

## 3. Make the service

Run `sudoedit /etc/systemd/system/num.service` and write:

```ini
[Unit]
Description=Num
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=120
StartLimitBurst=3

[Service]
User=num
Group=num
WorkingDirectory=/srv/num/current
Environment=HOST=127.0.0.1 PORT=<port> DATA_DIR=/var/lib/num BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
StateDirectory=num
ExecStart=/usr/local/bin/bun run apps/api/src/index.ts
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/num

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable num
```

Do not start the service yet. The first deploy starts it.

`StartLimitBurst` stops the service after 3 failed starts. Thus a failed migration does not start again and again.

### Listen address

With `HOST=127.0.0.1`, only the server can open Num. MCP then accepts only a request with a loopback `Host` header.
A proxy sends its own host name, and MCP answers `403`.

If a proxy or a private network (for example Tailscale) must reach Num, listen on all interfaces:

```sh
sudo systemctl edit num
```

```ini
[Service]
Environment=HOST=0.0.0.0
```

Then make sure that the firewall blocks `<port>` from the LAN. On Fedora, the `public` zone must not list the port:

```sh
sudo firewall-cmd --get-active-zones
sudo firewall-cmd --list-all --zone=public
```

From a computer on the LAN, `http://<server LAN address>:<port>` must not open.

## 4. Let the deploy restart the service

Run `sudo visudo -f /etc/sudoers.d/num-deploy` and write:

```
<user> ALL=(root) NOPASSWD: /usr/bin/systemctl restart num, /usr/bin/systemctl reset-failed num
```

The deploy script can then restart Num without a password, also through `ssh`. No other command gets this permission.

## 5. Make the deploy script

Run `sudoedit /usr/local/bin/num-deploy` and write:

```bash
#!/usr/bin/env bash
set -euo pipefail
REPO=$HOME/projects/num
ROOT=/srv/num
force=${1:-}

exec 9>"$ROOT/.deploy.lock"
flock -n 9 || { echo "A deploy is already running"; exit 0; }

if [[ -e $ROOT/hold && $force != --force ]]; then echo "Deploys on hold ($ROOT/hold)"; exit 0; fi

git -C "$REPO" fetch --quiet origin main
new=$(git -C "$REPO" rev-parse --short=12 origin/main)
cur=$(basename "$(readlink "$ROOT/current" || echo none)")

if [[ $new == "$cur" && $force != --force ]]; then exit 0; fi
if [[ -f $ROOT/failed && $(<"$ROOT/failed") == "$new" && $force != --force ]]; then
  echo "$new failed before. Fix main, or run: num-deploy --force"; exit 0
fi

trap 'if [[ $? -ne 0 ]]; then echo "$new" > "$ROOT/failed"; fi' EXIT
echo "Deploying $new (was $cur)"

rel=$ROOT/releases/$new
rm -rf "$rel" && mkdir -p "$rel"
git -C "$REPO" archive "$new" | tar -x -C "$rel"
cd "$rel"
bun install --frozen-lockfile
bun run --filter web build

ln -sfn "$rel" "$ROOT/current"
sudo systemctl reset-failed num
sudo systemctl restart num
sleep 3
if ! systemctl is-active --quiet num; then journalctl -u num -n 40 --no-pager; exit 1; fi

rm -f "$ROOT/failed"
echo "Deployed $new"
ls -1dt "$ROOT"/releases/* | tail -n +6 | xargs -r rm -rf
```

```sh
sudo chmod 755 /usr/local/bin/num-deploy
```

The script:

- Builds the newest commit of `main` in a new folder. A failed build does not change the live release.
- Restarts the service on the new release. systemd stops the old process before it starts the new one.
- Writes the commit to `/srv/num/failed` when the build or the start fails. It does not build that commit again
  without `--force`.
- Does nothing while `/srv/num/hold` exists.

## 6. Deploy

```sh
num-deploy
systemctl status num
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:<port>/api/health
```

The status must be `active (running)` and the health route must answer `200`.

To deploy from another computer: `ssh <user>@<server> num-deploy`.

## Roll back

```sh
touch /srv/num/hold
ls -t /srv/num/releases
ln -sfn /srv/num/releases/<commit> /srv/num/current
sudo systemctl restart num
```

Remove `/srv/num/hold` when `main` is correct again.

The database does not roll back with the code. When the newer release applied a migration, the older code can fail
on the newer database. Then restore a backup that you made before the deploy.

## Back up and restore

Copy the database while the service is stopped. Copy `num.sqlite` and `num.sqlite-wal` together.
The WAL file contains changes that are not yet in `num.sqlite`.

```sh
sudo systemctl stop num
sudo mkdir -p /var/lib/num-backups/<date>
sudo cp -p /var/lib/num/num.sqlite* /var/lib/num-backups/<date>/
sudo systemctl start num
```

Keep a copy on a different computer. A copy on the same disk does not survive a disk failure.

To restore:

```sh
sudo systemctl stop num
sudo rm -f /var/lib/num/num.sqlite /var/lib/num/num.sqlite-wal /var/lib/num/num.sqlite-shm
sudo install -o num -g num -m 600 /var/lib/num-backups/<date>/num.sqlite* /var/lib/num/
sudo rm -f /var/lib/num/num.sqlite-shm
sudo systemctl start num
```

Use `install`, not `mv`. `install` sets the owner and the SELinux label of the new files.

To move a database from another computer, copy `num.sqlite` and `num.sqlite-wal` to `/tmp` on the server.
Then use the same `install` command with the files in `/tmp`.

## Example: Cloudflare Tunnel, Cloudflare Access and an MCP portal

This example gives the web app on `https://num.<domain>` and MCP on `https://mcp.<domain>/mcp` for a client such as
the Claude app. It requires a domain on Cloudflare and a Cloudflare Zero Trust account. The free plan is sufficient.
Cloudflare changes its dashboard often. If a menu name is different, search the Cloudflare One documentation.

Set `HOST=0.0.0.0` (see "Listen address"). The tunnel connects out to Cloudflare. It does not open a port.

### Tunnel

1. Go to **Networking → Tunnels → Create a tunnel**. Give the tunnel the name of the server, not of the app.
   One tunnel serves all apps on the server.
2. Select your operating system and run the install command on the server. The command installs `cloudflared`
   as a service.
3. On the server, `systemctl status cloudflared` must show `active (running)`.

### Web app

Make the Access application before the route. Thus the host name is never open without a login.

1. Go to **Access controls → Applications → Add an application → Self-hosted**.
   - Host name: `num.<domain>`, with no path.
   - Policy: action **Allow**, include **Emails** with your email address.
   - Login method: **One-time PIN**.
2. In the tunnel, go to **Routes → Add route → Published application**.
   - Host name: `num.<domain>`.
   - Service URL: `http://localhost:<port>`.
3. Open `https://num.<domain>` in a private browser window. The Cloudflare login must show before Num.
4. Without a login, `curl -s -o /dev/null -w "%{http_code}\n" https://num.<domain>/api/health` must not answer `200`.

### MCP

The portal is the MCP address for clients. It sends each call to an MCP server. One portal can contain many servers.
The portal reaches Num through a private route of the tunnel. Num has no public MCP host name.

A private route cannot go to `127.0.0.1`. Use the LAN address of the server, and make it fixed with a DHCP reservation
in your router.

1. In the tunnel, go to **Routes → Add route → Private CIDR** and enter `<server LAN address>/32`.
2. Go to **Traffic policies → Traffic settings → Proxy and inspection**. Turn on
   **Allow Secure Web Gateway to proxy traffic**, with **TCP** and **UDP**.
3. Go to **Access controls → MCP Portals → MCP servers → Add MCP server**.
   - HTTP URL: `http://<server LAN address>:<port>/mcp`.
   - **Route traffic through Cloudflare Gateway**: on.
   - Authentication type: **None**. Num has no OAuth.
   - Policy: the same Allow policy as the web app.
   - The status must become **Ready**.
4. Go to **MCP Portals → Add MCP server portal**.
   - Custom domain: `mcp.<domain>`.
   - Add the Num server. **User auth required**: off.
   - Policy: the same Allow policy.
5. In the Access application of the portal, go to **Additional settings → OAuth** and turn on **Managed OAuth**.
   - Turn off **Allow localhost clients** and **Allow loopback clients**, unless a client on your computer
     connects directly.
   - Add the redirect URI of each client. For the Claude app: `https://claude.ai/api/mcp/auth_callback` and
     `https://claude.com/api/mcp/auth_callback`.
   - Save. Make sure that the URIs are still there after you change the portal.
6. In the client, add the URL `https://mcp.<domain>/mcp`. In the Claude app: **Settings → Connectors →
   Add custom connector**, with the defaults. Log in with the one-time PIN.

### Problems

| Symptom | Cause |
|---|---|
| The MCP server shows **Error**, "Could not connect to the upstream server". | The private route goes to `127.0.0.1` or to a wrong address, or `HOST` is a loopback address. On the server, test `curl` to `http://<server LAN address>:<port>/mcp`. |
| MCP answers `403` through the proxy. | `HOST` is a loopback address. Set `HOST=0.0.0.0`. |
| The client says that it cannot register with the sign-in service. | Managed OAuth is off, or the redirect URI of the client is not in the list of the portal application. |
| The portal says "No allowed servers available". | The server is not in the portal, is not **Ready**, or its policy does not allow you. |
