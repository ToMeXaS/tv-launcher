"""Grab a frame from the webcam pointed at the TV. Usage: python cam.py [out.jpg]"""
import sys
import cv2

out = sys.argv[1] if len(sys.argv) > 1 else "snap.jpg"
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
for _ in range(10):  # let auto-exposure settle
    cap.read()
ok, frame = cap.read()
cap.release()
if not ok:
    sys.exit("camera read failed")
cv2.imwrite(out, frame)
print(out)
