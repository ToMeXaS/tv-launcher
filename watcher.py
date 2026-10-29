"""Opens the custom UI app whenever the TV powers on. Usage: python watcher.py APP_ID

Polls the TV's REST API; on an off -> on transition, launches APP_ID.
Run with pythonw (no console), so events are appended to watcher.log.
"""
import json
import os
import sys
import time
import urllib.request

TV = "192.168.0.147"
POLL_SECONDS = 2
OFF_POLLS = 5  # consecutive not-on polls (~10 s) before the TV counts as off
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "watcher.log")


class PowerTracker:
    """Debounces power polls. update(state) returns True exactly when a launch should happen."""

    def __init__(self, initial="off"):
        self.on = initial == "on"
        self.misses = 0 if self.on else OFF_POLLS

    def update(self, state):
        if state == "on":
            self.misses = 0
            if not self.on:
                self.on = True
                return True
            return False
        self.misses = OFF_POLLS if state == "standby" else self.misses + 1
        if self.misses >= OFF_POLLS:
            self.on = False
        return False

    def launch_failed(self):
        self.on = False  # retry on the next "on" poll


def log(*parts):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(p) for p in parts) + "\n")
    except Exception:
        pass


def power_state():
    """'on', 'standby' (explicit from the TV) or 'unknown' (no/failed response)."""
    try:
        with urllib.request.urlopen(f"http://{TV}:8001/api/v2/", timeout=2) as r:
            state = json.load(r)["device"].get("PowerState", "on")
            return "on" if state == "on" else "standby"
    except Exception:
        return "unknown"


def launch(app_id):
    # On this TV (2023 firmware) ed.apps.launch did not open Tizen web apps; the REST endpoint does.
    req = urllib.request.Request(f"http://{TV}:8001/api/v2/applications/{app_id}", method="POST")
    urllib.request.urlopen(req, timeout=5).read()


if __name__ == "__main__":
    app_id = sys.argv[1]
    tracker = PowerTracker(power_state())
    while True:
        if tracker.update(power_state()):
            time.sleep(3)  # let the TV finish booting before launching
            try:
                launch(app_id)
                log("launched", app_id)
            except Exception as e:
                log("launch failed:", e)
                tracker.launch_failed()
        time.sleep(POLL_SECONDS)
