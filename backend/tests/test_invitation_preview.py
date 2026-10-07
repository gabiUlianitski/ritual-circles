import unittest

from app.services.circle_invitations import _preview_payload, invitee_listed_hobby


class InvitationPreviewTests(unittest.TestCase):
    def test_hobby_match_uses_listed_slug_only(self):
        self.assertTrue(invitee_listed_hobby("baseball", None, "Baseball"))
        self.assertTrue(invitee_listed_hobby(None, [{"slug": "baseball", "level": "pro"}], "baseball"))
        self.assertFalse(invitee_listed_hobby("tennis", [{"slug": "chess", "level": "1"}], "baseball"))

    def test_preview_payload_has_no_private_fields(self):
        payload = _preview_payload(
            {
                "id": "inv",
                "circle_id": "circ",
                "status": "pending",
                "inviter_first": "David",
                "inviter_last": "",
                "inviter_user_name": "david",
                "circle_name": "Weekly Baseball Meetup",
                "ritualType": "baseball",
                "hoby_display_name_raw": "Baseball",
                "hoby_i18n_json": None,
                "hoby_icon": "⚾",
                "description": "Sunday games",
                "recurringTime": "Sun 10:00",
                "is_recurring": True,
                "next_session_at": None,
                "modality": "offline",
                "city": "Tel Aviv",
                "city_name": "Tel Aviv",
                "meeting_place": "Park",
                "member_count": 1,
                "maxSize": 2,
                "preferred_hoby_slug": "baseball",
                "user_hobies_json": [{"slug": "baseball", "level": "pro"}],
                "inviteCode": "SECRET",
            },
            "en",
        )
        self.assertEqual(payload["title"], "Weekly Baseball Meetup")
        self.assertEqual(payload["hobyDisplayName"], "Baseball")
        self.assertEqual(payload["matchedHobbyName"], "Baseball")
        self.assertEqual(payload["memberCount"], 1)
        self.assertEqual(payload["maxSize"], 2)
        self.assertNotIn("inviteCode", payload)
        blob = " ".join(str(value) for value in payload.values())
        self.assertNotIn("SECRET", blob)
        self.assertNotIn("pro", blob)


if __name__ == "__main__":
    unittest.main()
