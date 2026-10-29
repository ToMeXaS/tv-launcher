"""Opens the custom UI app whenever the TV powers on. Usage: python watcher.py APP_ID

Polls the TV's REST API; on a standby/off -> on transition, launches APP_ID.
"""
import json
import sys
import time
import urllib.request

from remote import TV

POLL_SECONDS = 2


def power_state():
    try:
        with urllib.request.urlopen(f"http://{TV}:8001/api/v2/", timeout=2) as r:
            return json.load(r)["device"].get("PowerState", "on")
    except Exception:
        return "off"


def launch(app_id):
    # On this TV (2023 firmware) ed.apps.launch did not open Tizen web apps; the REST endpoint does.
    req = urllib.request.Request(f"http://{TV}:8001/api/v2/applications/{app_id}", method="POST")
    urllib.request.urlopen(req, timeout=5).read()


if __name__ == "__main__":
    app_id = sys.argv[1]
    was_on = power_state() == "on"
    while True:
        on = power_state() == "on"
        if on and not was_on:
            time.sleep(3)  # let the TV finish booting before launching
            try:
                launch(app_id)
                print(time.strftime("%H:%M:%S"), "launched", app_id, flush=True)
            except Exception as e:
                print(time.strftime("%H:%M:%S"), "launch failed:", e, flush=True)
                continue  # was_on stays False, so retry on next poll
        was_on = on
        time.sleep(POLL_SECONDS)
