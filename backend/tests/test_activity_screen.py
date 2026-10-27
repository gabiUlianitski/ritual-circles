"""Activities screen stays activity-first and uses server readiness fields."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web" / "src" / "ui"


class ActivityScreenTests(unittest.TestCase):
    def test_activity_page_opens_the_activity_and_keeps_circles_secondary(self) -> None:
        page = (WEB / "ActivityPage.tsx").read_text(encoding="utf-8")
        card = (WEB / "UpcomingActivityCard.tsx").read_text(encoding="utf-8")
        self.assertIn("listActivities", page)
        self.assertIn("upcomingActivityCards", page)
        self.assertIn("openActivity", page)
        self.assertIn("initialActivityId", page)
        self.assertIn("activityPage.yourCircles", page)
        self.assertLess(page.index("activityPage.upcoming"), page.index("activityPage.yourCircles"))
        self.assertNotIn("sessions", page.lower())
        self.assertNotIn("attendance", page.lower())
        self.assertIn("activity-decision-members", card)
        self.assertIn("home.membersCount", card)
        self.assertNotIn("participation.goingCount = props.memberCount", card)
        self.assertIn("activityParticipationDisplay", card)
        self.assertIn("activityPage.activityDetails", card)
        self.assertNotIn("goingCount >=", card)
        self.assertNotIn("minParticipants -", card)

    def test_readiness_labels_use_server_fields(self) -> None:
        source = (WEB / "activityDisplay.ts").read_text(encoding="utf-8")
        display = source.split("export function activityParticipationDisplay", 1)[1].split("export function activityReadinessLabel", 1)[0]
        self.assertIn("summary.isReady", display)
        self.assertIn("summary.remainingNeeded", display)
        self.assertIn("summary.isFull", display)
        self.assertIn("summary.remainingPlaces", display)
        self.assertNotIn("goingCount >=", display)
        self.assertNotIn("minParticipants", display)
        self.assertNotIn("sessions", source.lower())
        self.assertNotIn("attendance", source.lower())
