# Deploying Emberfall on Proxmox with a Cloudflare Tunnel

This guide takes you from an empty Proxmox cluster to `https://emberfall.yourdomain.com`, with:

- a dedicated **Debian 12 VM** running Docker
- Emberfall in a container, data on a volume, **automatic nightly database backups**
- a **Cloudflare Tunnel**: no open ports on your router, free HTTPS, WebSockets work out of the box
- optional **Cloudflare Access** so only invited emails can even load the page

Time: about 30–45 minutes.

**What you need:** a Proxmox cluster, a domain whose DNS is on Cloudflare (a free Cloudflare plan is fine), an Anthropic API key
if you want the AI DM, and access to the GitHub repo.

> **No domain?** Use Tailscale instead of Cloudflare. See [Alternative: Tailscale](#alternative-tailscale-no-domain-needed) at the end.

---

## 1. Create the VM (Proxmox)

A VM (rather than an LXC) is the most trouble-free home for Docker, and it migrates and backs up cleanly across the cluster.

Sizing: **2 vCPU, 2 GB RAM, 20 GB disk** is plenty for a group of friends. The game itself uses about 150 MB of RAM.
The build step is the heaviest part.

### Option A: from the Proxmox shell with a cloud image (fastest)

On any cluster node, open **Shell** in the web UI and run the commands below. Change `VMID`, `STORAGE` (often `local-lvm`, or your
Ceph/ZFS pool name) and `BRIDGE` to match your setup:

```bash
VMID=210; STORAGE=local-lvm; BRIDGE=vmbr0
cd /var/lib/vz/template/iso
wget -O debian-12-genericcloud-amd64.qcow2 https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2

qm create $VMID --name emberfall --memory 2048 --cores 2 --cpu host \
  --net0 virtio,bridge=$BRIDGE --ostype l26 --agent enabled=1 \
  --scsihw virtio-scsi-single \
  --scsi0 $STORAGE:0,import-from=/var/lib/vz/template/iso/debian-12-genericcloud-amd64.qcow2,discard=on,ssd=1 \
  --ide2 $STORAGE:cloudinit --boot order=scsi0 --serial0 socket --vga serial0 --onboot 1

qm resize $VMID scsi0 20G
qm set $VMID --ciuser emberfall --cipassword 'change-this-password' \
  --sshkeys ~/.ssh/authorized_keys --ipconfig0 ip=dhcp
qm start $VMID
```

- `--sshkeys` uses the keys already trusted by the Proxmox node. Point it at your own `.pub` file if you prefer.
- For a static IP, use `--ipconfig0 ip=192.168.1.50/24,gw=192.168.1.1` instead of DHCP. Either way, a DHCP reservation or a
  static IP makes life easier.
- After about a minute, find the IP under **VM → Summary** (once the guest agent is installed) or in your router's DHCP leases.

### Option B: from the web UI

**Create VM** → name `emberfall` → Debian 12 netinstall ISO → 2 cores / 2048 MB / 20 GB (VirtIO SCSI, Discard on) → VirtIO
network → install with "SSH server" and "standard system utilities" ticked, nothing else. Under **Options**, set **Start at boot = Yes**.

### High availability (optional, cluster)

If your VM storage is shared (Ceph, NFS), go to **Datacenter → HA → Add**, choose the VM, and set it to `started`. Proxmox will
restart it on another node if a node dies.

---

## 2. Prepare the VM

SSH in with `ssh emberfall@<vm-ip>`, then:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y qemu-guest-agent git curl ca-certificates unattended-upgrades
sudo systemctl enable --now qemu-guest-agent
sudo dpkg-reconfigure -plow unattended-upgrades   # answer "Yes" for automatic security updates
```

Install Docker Engine and the Compose plugin with Docker's official script:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in so the group change applies, then check that Docker works:

```bash
docker run --rm hello-world && docker compose version
```

---

## 3. Get the code and configure it

```bash
sudo mkdir -p /opt/emberfall && sudo chown $USER: /opt/emberfall
git clone https://github.com/PBreitbach1994/EmberfallBL.git /opt/emberfall
cd /opt/emberfall
cp .env.example .env
vim .env
```

> **Private repo?** On GitHub go to **Settings → Developer settings → Fine-grained tokens**, create a token with *Contents: read*
> for this repo only, then clone with `git clone https://<token>@github.com/PBreitbach1994/EmberfallBL.git /opt/emberfall`.
> Alternatively, add the VM's SSH public key as a read-only **Deploy key** on the repo and clone with the SSH URL.

Fill in `.env`:

| Setting | What to put |
|---|---|
| `INVITE_CODE` | The phrase friends type to join. Make it long; it's the game's front-door key. |
| `ANTHROPIC_API_KEY` | From console.anthropic.com → API Keys. Leave empty to use the scripted DM. Set a monthly spend limit in the console. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Filled in during step 5. |
| `BIND_ADDR` | Leave `0.0.0.0` while testing on the LAN. Set `127.0.0.1` once the tunnel works, so the port isn't reachable from the LAN. |

Lock the file down, because it holds secrets:

```bash
chmod 600 .env
```

---

## 4. First start (LAN test)

```bash
docker compose up -d --build
```

The first build takes 2–4 minutes. Then check it:

```bash
docker compose ps
docker compose logs -f emberfall
```

You should see `🏮 Emberfall is open on http://localhost:3000 (AI DM: enabled …)`. Press Ctrl+C to stop following the logs.

Open `http://<vm-ip>:3000` from a PC on your LAN and join with your name and the invite code. **The first account created
becomes the campaign owner (admin)**, so join yourself before giving anyone the link.

---

## 5. Cloudflare Tunnel (public HTTPS, no port forwarding)

The tunnel is an outbound connection from the VM to Cloudflare. Nothing on your router needs to change, and your home IP stays
hidden.

1. Go to the **Cloudflare dashboard → Zero Trust** (the first visit asks you to pick a team name; the free plan is fine) →
   **Networks → Tunnels → Create a tunnel**.
2. Choose **Cloudflared**, name it `emberfall`, and click **Save tunnel**.
3. On the install screen, pick **Docker**. Copy only the long token after `--token` (it starts with `eyJ…`) and paste it into
   `.env` as `CLOUDFLARE_TUNNEL_TOKEN=eyJ…`.
4. Click **Next** to reach **Public Hostname**:
   - **Subdomain:** `emberfall` · **Domain:** `yourdomain.com`
   - **Service type:** `HTTP` · **URL:** `emberfall:3000`

     That's the Docker service name, not localhost: cloudflared runs in its own container on the same Compose network.
   - Save.
5. Start the tunnel alongside the game:

   ```bash
   docker compose --profile tunnel up -d
   docker compose logs cloudflared | tail
   ```

   The logs should show `Registered tunnel connection` four times, and the dashboard should show the tunnel as **HEALTHY**.
6. Browse to `https://emberfall.yourdomain.com`. WebSockets (`/ws`) are proxied automatically, so live updates work.
7. Hide the LAN port. Set `BIND_ADDR=127.0.0.1` in `.env`, then:

   ```bash
   docker compose --profile tunnel up -d
   ```

> Always include `--profile tunnel` in `up`, `down` and `restart` commands from now on. `scripts/update.sh` does this for you
> when a tunnel token is present.

### Optional but recommended: Cloudflare Access (an extra login wall)

The invite code keeps strangers out of the game. Access keeps them from even loading the page, so bots never reach the server.

**Zero Trust → Access → Applications → Add → Self-hosted**:

- **Application domain:** `emberfall.yourdomain.com`
- **Policy:** `Allow`, with an **Include** rule of **Emails** listing your friends' addresses (or *Emails ending in* for a group).
- **Login method:** "One-time PIN": Cloudflare emails each person a code, so nobody needs a new account.
- **Session duration:** 1 month, so players aren't prompted every visit.

### Google sign-in (recommended once the tunnel works)

Players sign in with Google; Cloudflare checks them against your allow-list before anything reaches the
server, and the game verifies Cloudflare's signed identity on every request. No invite code, no passwords.

**Order matters — do it in this sequence so nobody loses their characters:**

1. **Pre-link existing players (optional).** While still on invite codes, open **Admin → Players** in the game and type
   each player's Gmail address next to their name. They'll land on their existing account automatically.
   Anyone you skip can claim their old account themselves on first sign-in (old name + invite code).
2. **Google OAuth client.** In Google Cloud Console → *APIs & Services*:
   - *OAuth consent screen*: External, app name "Emberfall", your email as support contact. Under *Audience*,
     set Publishing status to **In production** (only the basic email/profile scopes are used, so no verification
     review is needed) — otherwise only listed test users can sign in.
   - *Credentials → Create credentials → OAuth client ID → Web application*:
     - Authorized JavaScript origins: `https://<team>.cloudflareaccess.com`
     - Authorized redirect URIs: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
   - Copy the Client ID and Client secret. (`<team>` is your Zero Trust team name: **Zero Trust → Settings → Team name**.)
3. **Cloudflare login method.** Zero Trust → **Settings → Authentication → Login methods → Add new → Google**:
   paste the Client ID and secret, save, then click **Test**.
4. **Access application.** Zero Trust → **Access → Applications → Add an application → Self-hosted**:
   - Domain: your game hostname (e.g. `dnd.example.com`)
   - Login methods: Google (untick One-time PIN if you want Google only)
   - Policy: **Allow**, Include → **Emails** → your players' Gmail addresses (this is your invite list now)
   - Save, then open the application and copy its **Application Audience (AUD) Tag**.
5. **Tell the game.** In `.env` on the server:
   ```
   AUTH_MODE=access
   CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com
   CF_ACCESS_AUD=<the AUD tag>
   ADMIN_EMAILS=<your gmail>
   ```
   then `./scripts/update.sh` (or `docker compose --profile tunnel up -d`).
6. **Sign in** at your game URL. Your Gmail (from `ADMIN_EMAILS`) attaches to the existing owner account automatically.

Adding a friend later = add their email to the Access policy. Removing someone = remove it there.
In this mode the LAN address (`http://<vm-ip>:3000`) no longer lets anyone in, because there's no Cloudflare identity on it;
set `ALLOW_INVITE_LOGIN=true` temporarily if you ever need LAN access while Cloudflare is down.

### Optional hardening at Cloudflare

- **SSL/TLS → Edge Certificates:** turn on *Always Use HTTPS*.
- **Security → WAF → Rate limiting rules:** for example, 30 requests per 10 seconds on `/api/auth/*`, to throttle
  invite-code guessing.

---

## 6. Day-two operations

**Update to the latest version** (takes a pre-update database snapshot, pulls, rebuilds and restarts):

```bash
cd /opt/emberfall && ./scripts/update.sh
```

**Logs and status:**

```bash
docker compose logs -f --tail=100 emberfall
docker compose ps
```

**Backups:**

- The game writes a consistent snapshot to `/opt/emberfall/data/backups/` every 24 hours and keeps 14 of them (set with
  `BACKUP_HOURS` / `BACKUP_KEEP`). The campaign owner can also trigger one with `POST /api/admin/backup`.
- **Proxmox:** go to **Datacenter → Backup → Add**, choose the VM, schedule nightly, Mode *Snapshot*, with retention to taste.
  If you have Proxmox Backup Server, point the job at it.
- **Off-site:** copy `data/backups/` somewhere else occasionally, e.g. with rclone to cloud storage, or an rsync job from
  another machine.

**Restore a backup:**

```bash
docker compose --profile tunnel down
cp data/backups/emberfall-<timestamp>.db data/emberfall.db
rm -f data/emberfall.db-wal data/emberfall.db-shm
docker compose --profile tunnel up -d
```

**Change the invite code or API key:** edit `.env`, then run `docker compose --profile tunnel up -d`. Players who are already
signed in stay signed in.

**Moving to another node or VM:** Proxmox live-migrates the VM itself. To move to a fresh VM instead, copy `/opt/emberfall/.env`
and `/opt/emberfall/data/` across, then repeat steps 3–5. The tunnel token can move with you; there's nothing to change at
Cloudflare.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Set INVITE_CODE in .env` on `up` | `.env` is missing or not in `/opt/emberfall`. |
| Tunnel shows **DOWN** or `cloudflared` restarts | Check that the token is pasted completely, on one line, with no quotes. Look at `docker compose logs cloudflared`. |
| Cloudflare error **502 Bad Gateway** | The public hostname's service URL must be `http://emberfall:3000`. Check `docker compose ps` shows `emberfall` healthy. |
| Page loads but never updates live | Something between the browser and the server is stripping WebSockets. Cloudflare Tunnel supports them by default; if you put another proxy in front, enable WebSocket upgrade for `/ws`. |
| "AI DM offline (scripted mode)" | `ANTHROPIC_API_KEY` is empty or wrong. Check the startup line in `docker compose logs emberfall`. |
| Build fails with an out-of-memory error | Give the VM 2 GB of RAM, or add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`. |

---

## Alternative: Tailscale (no domain needed)

If your players can install Tailscale, you don't need anything public at all:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale serve --bg 3000      # https://emberfall.<your-tailnet>.ts.net for people on your tailnet
```

Share the VM with friends from the Tailscale admin console (**Machines → … → Share**). Or, to make it public without a domain,
use `sudo tailscale funnel --bg 3000`, which gives an internet-reachable https URL.
