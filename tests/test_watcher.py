import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from watcher import PowerTracker, OFF_POLLS


def run(tracker, states):
    return sum(1 for s in states if tracker.update(s))


class PowerTrackerTest(unittest.TestCase):
    def test_steady_on_no_launch(self):
        self.assertEqual(run(PowerTracker("on"), ["on", "on"]), 0)

    def test_short_blip_no_launch(self):
        self.assertEqual(run(PowerTracker("on"), ["on"] + ["unknown"] * (OFF_POLLS - 1) + ["on"]), 0)

    def test_real_off_then_on_launches_once(self):
        self.assertEqual(run(PowerTracker("on"), ["on"] + ["unknown"] * OFF_POLLS + ["on", "on"]), 1)

    def test_standby_counts_immediately(self):
        self.assertEqual(run(PowerTracker("on"), ["on", "standby", "on"]), 1)

    def test_starting_off_then_on_launches(self):
        self.assertEqual(run(PowerTracker("unknown"), ["unknown", "on"]), 1)

    def test_launch_failure_retries(self):
        t = PowerTracker("off")
        self.assertTrue(t.update("on"))
        t.launch_failed()
        self.assertTrue(t.update("on"))


if __name__ == "__main__":
    unittest.main()
