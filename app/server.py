import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import requests
from flask import Flask, jsonify, redirect, request, send_from_directory

from .smartthings import AuthError, SmartThings, load_json, save_json

POLL_SECONDS = max(10, int(os.environ.get("POLL_SECONDS", "30")))

app = Flask(__name__, static_folder="static", static_url_path="/static")
st = SmartThings()

DEFAULT_LAYOUT = {"columns": 9, "tiles": []}
layout = load_json("layout.json", DEFAULT_LAYOUT)
states = {}          # deviceId -> normalised state
state_errors = {}    # deviceId -> message
last_poll = 0.0
wake = threading.Event()
device_cache = {"at": 0, "items": []}


# ---- helpers ------------------------------------------------------------
def tile_types(caps):
    """Which kinds of tile a device can be shown as, best guess first."""
    t = []
    if "thermostatMode" in caps or "thermostatCoolingSetpoint" in caps:
        t.append("thermostat")
    if "garageDoorControl" in caps or "doorControl" in caps:
        t.append("garage")
    if "lock" in caps:
        t.append("lock")
    if "contactSensor" in caps:
        t.append("contact")
    if "motionSensor" in caps:
        t.append("motion")
    if "switch" in caps:
        t.append("switch")
    if "temperatureMeasurement" in caps:
        t.append("temperature")
    if "relativeHumidityMeasurement" in caps:
        t.append("humidity")
    return t or ["generic"]


def normalise(status):
    main = (status.get("components") or {}).get("main") or {}

    def v(cap, attr):
        return ((main.get(cap) or {}).get(attr) or {}).get("value")

    temp = (main.get("temperatureMeasurement") or {}).get("temperature") or {}
    return {
        "switch": v("switch", "switch"),
        "level": v("switchLevel", "level"),
        "contact": v("contactSensor", "contact"),
        "motion": v("motionSensor", "motion"),
        "lock": v("lock", "lock"),
        "door": v("garageDoorControl", "door") or v("doorControl", "door"),
        "temperature": temp.get("value"),
        "unit": temp.get("unit", "F"),
        "humidity": v("relativeHumidityMeasurement", "humidity"),
        "battery": v("battery", "battery"),
        "mode": v("thermostatMode", "thermostatMode"),
        "modes": v("thermostatMode", "supportedThermostatModes"),
        "operating": v("thermostatOperatingState", "thermostatOperatingState"),
        "fan": v("thermostatFanMode", "thermostatFanMode"),
        "fanModes": v("thermostatFanMode", "supportedThermostatFanModes"),
        "cool": v("thermostatCoolingSetpoint", "coolingSetpoint"),
        "heat": v("thermostatHeatingSetpoint", "heatingSetpoint"),
    }


def refresh_device(device_id):
    try:
        states[device_id] = normalise(st.device_status(device_id))
        state_errors.pop(device_id, None)
    except AuthError:
        raise
    except requests.RequestException as e:
        state_errors[device_id] = str(e)


def poll_loop():
    global last_poll
    while True:
        if st.connected:
            ids = sorted({t["deviceId"] for t in layout["tiles"]})
            try:
                with ThreadPoolExecutor(max_workers=6) as pool:
                    list(pool.map(refresh_device, ids))
                last_poll = time.time()
            except AuthError as e:
                print("Auth problem:", e, flush=True)
            except Exception as e:  # keep the poller alive no matter what
                print("Poll error:", e, flush=True)
        wake.wait(POLL_SECONDS)
        wake.clear()


threading.Thread(target=poll_loop, daemon=True).start()


def err(msg, code=400):
    return jsonify({"error": msg}), code


# ---- pages --------------------------------------------------------------
@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/callback")
def callback():
    code = request.args.get("code")
    if code:
        try:
            st.exchange_code(code)
            wake.set()
        except (AuthError, requests.RequestException) as e:
            return f"Login failed: {e}", 400
    return redirect("/")


# ---- auth API -----------------------------------------------------------
@app.get("/api/status")
def status():
    return jsonify({
        "configured": st.configured,
        "connected": st.connected,
        "redirect_uri": st.settings.get("redirect_uri", ""),
        "client_id": st.settings.get("client_id", ""),
        "poll_seconds": POLL_SECONDS,
    })


@app.post("/api/auth/settings")
def auth_settings():
    d = request.get_json(force=True)
    secret = d.get("client_secret", "").strip() or st.settings.get("client_secret", "")
    if not (d.get("client_id", "").strip() and secret and d.get("redirect_uri", "").strip()):
        return err("Please fill in all three boxes.")
    st.save_settings(d["client_id"], secret, d["redirect_uri"])
    return jsonify({"url": st.authorize_url()})


@app.get("/api/auth/url")
def auth_url():
    if not st.configured:
        return err("Enter your Client ID and Secret first.")
    return jsonify({"url": st.authorize_url()})


@app.post("/api/auth/exchange")
def auth_exchange():
    try:
        st.exchange_code(request.get_json(force=True).get("code", ""))
    except (AuthError, requests.RequestException) as e:
        return err(str(e))
    wake.set()
    return jsonify({"ok": True})


@app.post("/api/auth/disconnect")
def auth_disconnect():
    st.disconnect()
    return jsonify({"ok": True})


# ---- devices / layout / state -------------------------------------------
@app.get("/api/devices")
def devices():
    if not st.connected:
        return err("Not connected.", 401)
    if request.args.get("refresh") or time.time() - device_cache["at"] > 300:
        try:
            raw = st.list_devices()
            rooms = st.room_names({d.get("locationId") for d in raw if d.get("locationId")})
        except AuthError as e:
            return err(str(e), 401)
        except requests.RequestException as e:
            return err(f"Could not reach SmartThings: {e}", 502)
        items = []
        for d in raw:
            caps = sorted({c["id"] for comp in d.get("components", [])
                           if comp.get("id") == "main" for c in comp.get("capabilities", [])})
            items.append({
                "deviceId": d["deviceId"],
                "name": d.get("label") or d.get("name") or d["deviceId"],
                "room": rooms.get(d.get("roomId"), ""),
                "caps": caps,
                "types": tile_types(caps),
            })
        items.sort(key=lambda x: (x["room"].lower(), x["name"].lower()))
        device_cache.update(at=time.time(), items=items)
    return jsonify(device_cache["items"])


@app.get("/api/layout")
def get_layout():
    return jsonify(layout)


@app.put("/api/layout")
def put_layout():
    d = request.get_json(force=True)
    tiles = []
    for t in d.get("tiles", []):
        tiles.append({
            "id": str(t.get("id") or uuid.uuid4().hex[:8]),
            "deviceId": str(t["deviceId"]),
            "label": str(t.get("label", ""))[:60],
            "type": str(t.get("type", "generic")),
            "icon": str(t.get("icon", "")),
            "caps": [str(c) for c in t.get("caps", [])],
            "x": max(1, int(t.get("x", 1))), "y": max(1, int(t.get("y", 1))),
            "w": max(1, int(t.get("w", 1))), "h": max(1, int(t.get("h", 1))),
        })
    layout.clear()
    layout.update(columns=max(3, min(20, int(d.get("columns", 9)))), tiles=tiles)
    save_json("layout.json", layout)
    wake.set()
    return jsonify(layout)


@app.get("/api/states")
def get_states():
    return jsonify({"states": states, "errors": state_errors, "updated": last_poll,
                    "connected": st.connected})


@app.post("/api/devices/<device_id>/command")
def command(device_id):
    d = request.get_json(force=True)
    try:
        st.command(device_id, d["capability"], d["command"], d.get("args"))
    except AuthError as e:
        return err(str(e), 401)
    except requests.RequestException as e:
        return err(f"SmartThings said no: {e}", 502)
    time.sleep(1.5)  # let the device settle, then pull fresh state
    try:
        refresh_device(device_id)
    except AuthError:
        pass
    return jsonify({"state": states.get(device_id)})
