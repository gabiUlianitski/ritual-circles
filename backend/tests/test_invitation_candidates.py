import unittest

from app.services.circle_invitations import candidate_reason_label


class CandidateReasonTests(unittest.TestCase):
    def test_highest_tier_wins_without_a_score(self):
        label = candidate_reason_label(
            listed=True,
            preferred=True,
            played=True,
            same_city=True,
            hobby_name="Baseball",
            city_name="Tel Aviv",
            lang="en",
        )
        self.assertEqual(label, "Interested in Baseball")
        self.assertNotIn("%", label or "")

    def test_preferred_when_hobby_is_not_in_the_list(self):
        label = candidate_reason_label(
            listed=False,
            preferred=True,
            played=True,
            same_city=False,
            hobby_name="Baseball",
            city_name="",
            lang="en",
        )
        self.assertEqual(label, "Baseball is one of their primary interests")

    def test_participation_when_that_is_the_only_signal(self):
        label = candidate_reason_label(
            listed=False,
            preferred=False,
            played=True,
            same_city=True,
            hobby_name="Baseball",
            city_name="Tel Aviv",
            lang="en",
        )
        self.assertEqual(label, "Participates in Baseball activities")

    def test_city_reason_only_without_a_stronger_signal(self):
        label = candidate_reason_label(
            listed=False,
            preferred=False,
            played=False,
            same_city=True,
            hobby_name="Baseball",
            city_name="Tel Aviv",
            lang="en",
        )
        self.assertEqual(label, "Also in Tel Aviv")


if __name__ == "__main__":
    unittest.main()
