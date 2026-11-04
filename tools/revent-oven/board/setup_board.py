#!/usr/bin/env python3
"""Set up the oven board over USB: its collector key, the IMS address and,
optionally, the Wi-Fi. Never prints the key or the password.

    ~/.safia-esp/venv/bin/python setup_board.py                 # key + server, then show
    ~/.safia-esp/venv/bin/python setup_board.py --wifi "Name"   # also the Wi-Fi (asks the password)
    ~/.safia-esp/venv/bin/python setup_board.py --show          # only what the board says
    ~/.safia-esp/venv/bin/python setup_board.py --cmd run       # any console command

The Wi-Fi can also be set from a phone: hold the board's «0» button for
3 seconds, join the «Safia-Pech-XXXX» network and open http://192.168.4.1.
"""
import argparse
import getpass
import glob
import os
import sys
import time

try:
    import serial  # pyserial (installed with esptool in ~/.safia-esp/venv)
except ImportError:
    sys.exit("pyserial is missing: ~/.safia-esp/venv/bin/pip install pyserial")

KEY_FILE = os.path.expanduser("~/.safia/oven-board.key")
SERVER = "https://production.safiacorporate.uz"


def find_port():
    ports = sorted(glob.glob("/dev/cu.usbmodem*"))
    if not ports:
        sys.exit("No board on USB (no /dev/cu.usbmodem*). Plug it in; if it is new, see README.")
    return ports[0]


def talk(ser, line, timeout=8.0, quiet=False):
    """Send one console line; return the answer lines up to OK/ERR."""
    ser.reset_input_buffer()
    ser.write((line + "\n").encode("utf-8"))
    ser.flush()
    out, end = [], time.time() + timeout
    while time.time() < end:
        raw = ser.readline()
        if not raw:
            continue
        text = raw.decode("utf-8", "replace").rstrip("\r\n")
        if text.startswith("[") and "] " in text and not text.startswith(("OK", "ERR")):
            # a log line the board printed meanwhile
            if not quiet:
                print("  " + text)
            continue
        out.append(text)
        if text.startswith("OK") or text.startswith("ERR"):
            return out
    out.append("ERR no answer from the board")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", default=None)
    ap.add_argument("--key-file", default=KEY_FILE)
    ap.add_argument("--server", default=SERVER)
    ap.add_argument("--wifi", default=None, help="the Wi-Fi network's name (the password is asked)")
    ap.add_argument("--no-key", action="store_true", help="leave the key as it is")
    ap.add_argument("--show", action="store_true", help="only print what the board says")
    ap.add_argument("--cmd", default=None, help="send one console command and print the answer")
    a = ap.parse_args()
    port = a.port or find_port()
    ser = serial.Serial(port, 115200, timeout=0.3)
    time.sleep(0.5)
    ok = True
    try:
        if a.cmd:
            for ln in talk(ser, a.cmd, timeout=60):
                print(ln)
            return 0
        if not a.show:
            if not a.no_key:
                try:
                    key = open(a.key_file).read().strip()
                except OSError:
                    sys.exit("No key file at %s" % a.key_file)
                ans = talk(ser, "set key " + key, quiet=True)
                print(ans[-1])
                ok &= ans[-1].startswith("OK")
            ans = talk(ser, "set server " + a.server, quiet=True)
            print(ans[-1])
            ok &= ans[-1].startswith("OK")
            if a.wifi:
                pw = getpass.getpass("Password for «%s» (empty for an open network): " % a.wifi)
                ans = talk(ser, "set pass " + pw, quiet=True)
                print(ans[-1])
                ans = talk(ser, "set ssid " + a.wifi, quiet=True)
                print(ans[-1])
                ok &= ans[-1].startswith("OK")
        for ln in talk(ser, "show"):
            print(ln)
    finally:
        ser.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
