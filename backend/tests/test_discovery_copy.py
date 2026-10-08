import unittest

from app.services.for_you_intro import clamp_sentence
from app.services.hoby_enrichment import sanitize_discovery_description


class DiscoveryCopyTests(unittest.TestCase):
    def test_discovery_description_keeps_three_sentences_under_250(self) -> None:
        text = "Coffee brings people together. Shared cups make conversation easy. There is always another café to try. This fourth sentence should be dropped."
        kept = sanitize_discovery_description(text)
        self.assertIsNotNone(kept)
        assert kept is not None
        self.assertLessEqual(len(kept), 250)
        self.assertNotIn("fourth", kept)
        self.assertEqual(kept.count("."), 3)

    def test_for_you_sentence_is_one_short_line(self) -> None:
        long = "A" * 40 + " " + "B" * 200
        kept = clamp_sentence(f'"{long}. Second sentence stays out."')
        self.assertIsNotNone(kept)
        assert kept is not None
        self.assertLessEqual(len(kept), 150)
        self.assertNotIn("Second", kept)


if __name__ == "__main__":
    unittest.main()
