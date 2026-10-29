"""Samsung Tizen network remote. Usage: python remote.py KEY_HOME KEY_DOWN*3 KEY_ENTER ...

First connection shows an "Allow" prompt on the TV; the token it grants is saved to token.txt.
"""
import base64
import json
import os
import ssl
import sys
import time

import websocket

TV = "192.168.0.147"
NAME = base64.b64encode(b"PC Remote").decode()
TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "token.txt")


def connect():
    token = open(TOKEN_FILE).read().strip() if os.path.exists(TOKEN_FILE) else ""
    url = f"wss://{TV}:8002/api/v2/channels/samsung.remote.control?name={NAME}"
    if token:
        url += f"&token={token}"
    ws = websocket.create_connection(url, sslopt={"cert_reqs": ssl.CERT_NONE}, timeout=60)
    msg = json.loads(ws.recv())
    if msg.get("event") != "ms.channel.connect":
        sys.exit(f"connect refused: {msg}")
    new = msg.get("data", {}).get("token")
    if new and new != token:
        with open(TOKEN_FILE, "w") as f:
            f.write(new)
    return ws


def press(ws, key):
    ws.send(json.dumps({"method": "ms.remote.control", "params": {
        "Cmd": "Click", "DataOfCmd": key, "Option": "false", "TypeOfRemote": "SendRemoteKey"}}))
    time.sleep(0.6)


if __name__ == "__main__":
    ws = connect()
    for arg in sys.argv[1:]:
        key, _, n = arg.partition("*")
        for _ in range(int(n or 1)):
            press(ws, key)
    ws.close()
    print("ok")
