"""Thin SmartThings API client with OAuth token handling."""
import json
import os
import threading
import time
from urllib.parse import parse_qs, urlparse

import requests

API = "https://api.smartthings.com/v1"
OAUTH = "https://api.smartthings.com/oauth"
SCOPES = "r:devices:* x:devices:* r:locations:*"

DATA_DIR = os.environ.get("DATA_DIR", "./data")
os.makedirs(DATA_DIR, exist_ok=True)


def load_json(name, default):
    try:
        with open(os.path.join(DATA_DIR, name)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_json(name, data):
    path = os.path.join(DATA_DIR, name)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


class AuthError(Exception):
    pass


class SmartThings:
    def __init__(self):
        self.lock = threading.Lock()
        self.settings = load_json("settings.json", {})
        self.tokens = load_json("tokens.json", {})

    # ---- OAuth -------------------------------------------------------
    def save_settings(self, client_id, client_secret, redirect_uri):
        self.settings = {
            "client_id": client_id.strip(),
            "client_secret": client_secret.strip(),
            "redirect_uri": redirect_uri.strip(),
        }
        save_json("settings.json", self.settings)

    @property
    def configured(self):
        return all(self.settings.get(k) for k in ("client_id", "client_secret", "redirect_uri"))

    @property
    def connected(self):
        return bool(self.tokens.get("refresh_token"))

    def authorize_url(self):
        req = requests.Request("GET", f"{OAUTH}/authorize", params={
            "client_id": self.settings["client_id"],
            "response_type": "code",
            "redirect_uri": self.settings["redirect_uri"],
            "scope": SCOPES,
        }).prepare()
        return req.url

    def _token_request(self, data):
        r = requests.post(
            f"{OAUTH}/token",
            data=data,
            auth=(self.settings["client_id"], self.settings["client_secret"]),
            timeout=20,
        )
        if r.status_code != 200:
            raise AuthError(f"SmartThings refused the login ({r.status_code}): {r.text[:200]}")
        t = r.json()
        self.tokens = {
            "access_token": t["access_token"],
            "refresh_token": t.get("refresh_token", self.tokens.get("refresh_token")),
            "expires_at": time.time() + int(t.get("expires_in", 86400)) - 120,
        }
        save_json("tokens.json", self.tokens)

    def exchange_code(self, code_or_url):
        """Accepts a bare code or the full redirect URL the browser ended up on."""
        code = code_or_url.strip()
        if "code=" in code:
            code = parse_qs(urlparse(code).query).get("code", [""])[0]
        if not code:
            raise AuthError("Could not find a code in what you pasted.")
        with self.lock:
            self._token_request({
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.settings["redirect_uri"],
                "client_id": self.settings["client_id"],
            })

    def disconnect(self):
        self.tokens = {}
        save_json("tokens.json", {})

    def _access_token(self):
        with self.lock:
            if not self.connected:
                raise AuthError("Not connected to SmartThings.")
            if time.time() >= self.tokens.get("expires_at", 0):
                self._token_request({
                    "grant_type": "refresh_token",
                    "refresh_token": self.tokens["refresh_token"],
                    "client_id": self.settings["client_id"],
                })
            return self.tokens["access_token"]

    # ---- API ---------------------------------------------------------
    def request(self, method, path, **kw):
        headers = {"Authorization": f"Bearer {self._access_token()}"}
        r = requests.request(method, f"{API}{path}", headers=headers, timeout=20, **kw)
        if r.status_code == 401:
            raise AuthError("SmartThings rejected the saved login. Please reconnect.")
        r.raise_for_status()
        return r.json() if r.content else {}

    def list_devices(self):
        items, path = [], "/devices"
        while path:
            data = self.request("GET", path)
            items += data.get("items", [])
            nxt = (data.get("_links") or {}).get("next", {}).get("href")
            path = nxt.replace(API, "") if nxt else None
        return items

    def room_names(self, location_ids):
        names = {}
        for loc in location_ids:
            try:
                for room in self.request("GET", f"/locations/{loc}/rooms").get("items", []):
                    names[room["roomId"]] = room.get("name", "")
            except requests.RequestException:
                pass
        return names

    def device_status(self, device_id):
        return self.request("GET", f"/devices/{device_id}/status")

    def command(self, device_id, capability, command, args=None):
        body = {"commands": [{
            "component": "main", "capability": capability,
            "command": command, "arguments": args or [],
        }]}
        return self.request("POST", f"/devices/{device_id}/commands", json=body)
