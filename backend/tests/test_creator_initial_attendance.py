"""Creator is attending the session they just created. Later weeks stay unset."""

import unittest

from app.services.circles_service import initial_creator_attendance_status


class CreatorInitialAttendanceTests(unittest.TestCase):
    def test_first_session_is_attending(self) -> None:
        self.assertEqual(initial_creator_attendance_status(0), "attending")

    def test_later_sessions_stay_not_attending(self) -> None:
        self.assertEqual(initial_creator_attendance_status(1), "not_attending")
        self.assertEqual(initial_creator_attendance_status(5), "not_attending")


if __name__ == "__main__":
    unittest.main()
