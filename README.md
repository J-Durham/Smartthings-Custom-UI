# Home Tiles – a self-hosted SmartThings dashboard

A simple wall-panel style dashboard for your Samsung SmartThings devices, run on your own home network. It discovers your devices, and you arrange them as tiles (doors, windows, lights, temperatures, thermostats, locks, garage doors…). A basic replacement for ActionTiles.

Everything stays on your network. Your login is stored only in the `data` folder on the computer running it.

---

## What you need

- A computer that stays on (Windows, Mac, Linux, or a Raspberry Pi/NAS)
- **Docker** – free. Install **Docker Desktop** from <https://www.docker.com/products/docker-desktop/> and open it once so it's running.
- **Git** – free, from <https://git-scm.com/downloads>
- Your Samsung account (the one SmartThings uses)

---

## Part 1 – Get your SmartThings keys (one time, ~10 minutes)

SmartThings needs to know this dashboard is allowed to see and control your devices. You do that by creating a small private "app" in your own account. This gives you a **Client ID** and a **Client Secret**, which are the keys.

> Note: the old "Personal Access Token" expires after 24 hours, so this guide uses the method that keeps working long-term.

### 1. Install the SmartThings CLI
Download the installer for your computer from
<https://github.com/SmartThingsCommunity/smartthings-cli/releases> (Windows: `.msi`, Mac: `.pkg`).
Mac users with Homebrew can instead run: `brew install smartthingscommunity/smartthings/smartthings`

### 2. Create the app
Open a terminal (Windows: search for "PowerShell"; Mac: open "Terminal") and run:

```
smartthings apps:create
```

The first time, a browser window opens asking you to log in to Samsung. Do that, then come back to the terminal and answer the questions:

| Question | Answer |
|---|---|
| App type | **OAuth-In App** |
| Display name | `Home Tiles` |
| Description | `Home dashboard` |
| Icon image URL | press Enter (skip) |
| Target URL | press Enter (skip) |
| Select scopes | use arrow keys and the **space bar** to tick: `r:devices:*`, `x:devices:*`, `r:locations:*` (tick `w:devices:*` too if offered), then press Enter |
| Redirect URI | `https://example.com/callback` then Enter, then choose "Finish editing" |
| Finish | confirm to create |

### 3. Write down the keys
When it finishes, the terminal prints **OAuth Client Id** and **OAuth Client Secret**. Copy them somewhere safe. **The secret is shown only once.** (If you lose it, just run the command again to make a new app.)

---

## Part 2 – Install and start the dashboard

Open a terminal and run these one at a time:

```
git clone https://github.com/J-Durham/Smartthings-Custom-UI.git
cd Smartthings-Custom-UI
docker compose up -d --build
```

The first run takes a few minutes. When it's done, open a web browser **on that same computer** and go to:

**<http://localhost:8080>**

To open it from a phone/tablet/other computer on your network, use `http://<that computer's IP address>:8080` (for example `http://192.168.1.50:8080`).

---

## Part 3 – Connect to SmartThings (one time)

A setup window appears the first time you open the dashboard:

1. Paste your **Client ID** and **Client Secret**. Leave the Redirect URI as `https://example.com/callback` (it must exactly match what you entered in Part 1). Click **Save & continue**.
2. Click **Open SmartThings login**, sign in, choose your location, and press **Allow**.
3. Your browser then goes to a plain page saying "Example Domain" or "Not Found". **That is expected.** Copy the *entire address* from the top of the browser (it contains `code=...`), paste it into the box in the setup window, and click **Connect**.

> Why example.com? SmartThings refuses plain `http://` redirect addresses, so we use a harmless placeholder `https://` one. The code in the address is useless without your Client Secret, which never leaves your computer.

---

## Part 4 – Build your tiles

- Click **Edit** (top right).
- **+ Add tile** lists every device found in your SmartThings account. Search, then click the button for the kind of tile you want. A device with several sensors (e.g. temperature and humidity) can be added once for each.
- **Drag** a tile to move it. **Click** a tile to rename it, change its icon, make it wider/taller, or remove it.
- **Columns** changes how many tiles fit across.
- Click **Done** when finished. Your layout is saved automatically.

Using it: tap a light, lock or garage door tile to toggle it. Tap **⋮** on a dimmer or thermostat tile for brightness, temperature and mode controls. Blue tiles mean "on / open / active". Tiles refresh every 30 seconds.

---

## Everyday commands

Run these inside the `Smartthings-Custom-UI` folder:

| What | Command |
|---|---|
| Stop | `docker compose down` |
| Start again | `docker compose up -d` |
| Update to the newest version | `git pull` then `docker compose up -d --build` |
| See what's going wrong | `docker compose logs` |

It restarts automatically when the computer reboots (as long as Docker Desktop starts with the computer).

**Backups:** your tiles and login live in the `data` folder next to `docker-compose.yml`. Copy it to back up.

## Troubleshooting

- **"Redirect URI mismatch" from SmartThings** – the Redirect URI in the setup window must be *identical* to the one registered in Part 1. Check what's registered with `smartthings apps:oauth <app id>` (find the id with `smartthings apps`). If `redirectUris` is empty or wrong, fix it with `smartthings apps:oauth:update <app id>`.
- **403 Forbidden on the SmartThings login page** – the redirect URI must start with `https://`; `http://localhost` is rejected.
- **Tiles stopped updating / "Please reconnect"** – click ⚙ (top right) → Disconnect, then repeat Part 3.
- **Can't reach it from another device** – check the host computer's firewall allows port 8080.
- **Wrong timezone on "Updated" time** – edit `TZ` in `docker-compose.yml`.

## Not included yet

Smart Home Monitor (arm/disarm), scenes, and live push updates (it polls instead).

## Security note

There's no password on the dashboard. Anyone on your home network can view and control tiles. Don't expose port 8080 to the internet.

---
*Developer notes: Flask app in `app/`, static UI in `app/static/`, `archive_ui/` holds the earlier experiments.*
