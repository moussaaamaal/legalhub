"""
Chapitre 2 — Sprint 2 : Gestion interne du cabinet
Tests fonctionnels des endpoints /api/firm/*

Cas couverts (9 tests):
  TC21  Lire le profil du cabinet (GET /profile)
  TC22  Mettre à jour le profil du cabinet (PUT /profile) — admin uniquement
  TC23  Lister les membres de l'équipe (GET /team)
  TC24  Modifier le rôle d'un membre (PUT /team/{id}/role)
  TC25  Désactiver un membre (DELETE /team/{id})
  TC26  Lire la personnalisation visuelle (GET /branding)
  TC27  Mettre à jour la personnalisation (PUT /branding)
  TC28  Obtenir le code cabinet (GET /office-code) — admin uniquement
  TC29  Statistiques globales du cabinet (GET /stats) — admin uniquement
  TC_GUARD  Contrôle d'accès : actions admin bloquées pour un simple avocat
"""

import pytest
import requests

BASE_URL = "http://localhost:8000"


def api(path):
    return f"{BASE_URL}{path}"


# ─────────────────────────────────────────────────────────────────────────────
# TC21–TC22 — Profil du cabinet
# ─────────────────────────────────────────────────────────────────────────────

class TestFirmProfile:

    def test_tc21_get_firm_profile(self, admin_headers, admin_credentials):
        """GET /firm/profile retourne les infos du cabinet."""
        resp = requests.get(api("/api/firm/profile"), headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == admin_credentials["firm_name"]
        assert "office_code" in data
        assert "legal_entity_type" in data

    def test_tc21b_lawyer_can_read_profile(self, lawyer_headers):
        """Un avocat peut aussi lire le profil du cabinet (lecture seule)."""
        resp = requests.get(api("/api/firm/profile"), headers=lawyer_headers)
        assert resp.status_code == 200

    def test_tc22_update_firm_profile(self, admin_headers):
        """PUT /firm/profile met à jour les informations du cabinet."""
        resp = requests.put(api("/api/firm/profile"), headers=admin_headers, json={
            "address": "12 Rue de la Justice",
            "city": "Sfax",
            "country": "Tunisie",
            "practice_areas": ["Droit civil", "Droit commercial"],
            "description": "Cabinet de test automatisé",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["city"] == "Sfax"
        assert "Droit civil" in data["practice_areas"]

    def test_tc22b_update_profile_empty_body(self, admin_headers):
        """PUT /firm/profile sans champs → 400."""
        resp = requests.put(api("/api/firm/profile"), headers=admin_headers, json={})
        assert resp.status_code == 400

    def test_tc22c_lawyer_cannot_update_profile(self, lawyer_headers):
        """Un simple avocat ne peut pas modifier le profil du cabinet → 403."""
        resp = requests.put(api("/api/firm/profile"), headers=lawyer_headers, json={
            "city": "Tunis",
        })
        assert resp.status_code == 403


# ─────────────────────────────────────────────────────────────────────────────
# TC23 — Liste des membres
# ─────────────────────────────────────────────────────────────────────────────

class TestTeam:

    def test_tc23_list_team(self, admin_headers):
        """GET /firm/team retourne la liste des membres (admin + avocats)."""
        resp = requests.get(api("/api/firm/team"), headers=admin_headers)
        assert resp.status_code == 200
        members = resp.json()
        assert isinstance(members, list)
        # At minimum: the admin + the lawyer created in conftest
        assert len(members) >= 2
        roles = {m["role"] for m in members}
        assert "FIRM_ADMIN" in roles
        assert "LAWYER" in roles

    def test_tc23b_clients_not_in_team(self, admin_headers):
        """La liste d'équipe ne contient pas les clients."""
        resp = requests.get(api("/api/firm/team"), headers=admin_headers)
        members = resp.json()
        for m in members:
            assert m["role"] != "CLIENT"

    def test_tc23c_lawyer_can_list_team(self, lawyer_headers):
        """Un avocat peut aussi consulter la liste de l'équipe."""
        resp = requests.get(api("/api/firm/team"), headers=lawyer_headers)
        assert resp.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# TC24 — Modifier le rôle d'un membre
# ─────────────────────────────────────────────────────────────────────────────

class TestTeamRole:

    def test_tc24_update_member_role(self, admin_headers, lawyer_user_id):
        """PUT /firm/team/{id}/role permet de promouvoir un avocat en admin."""
        # Promote lawyer → FIRM_ADMIN
        resp = requests.put(
            api(f"/api/firm/team/{lawyer_user_id}/role"),
            headers=admin_headers,
            json={"role": "FIRM_ADMIN"},
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "FIRM_ADMIN"

        # Revert to LAWYER
        resp2 = requests.put(
            api(f"/api/firm/team/{lawyer_user_id}/role"),
            headers=admin_headers,
            json={"role": "LAWYER"},
        )
        assert resp2.status_code == 200
        assert resp2.json()["role"] == "LAWYER"

    def test_tc24b_invalid_role(self, admin_headers, lawyer_user_id):
        """Rôle invalide → 400."""
        resp = requests.put(
            api(f"/api/firm/team/{lawyer_user_id}/role"),
            headers=admin_headers,
            json={"role": "SUPERUSER"},
        )
        assert resp.status_code == 400

    def test_tc24c_lawyer_cannot_change_role(self, lawyer_headers, lawyer_user_id):
        """Un avocat ne peut pas changer les rôles → 403."""
        resp = requests.put(
            api(f"/api/firm/team/{lawyer_user_id}/role"),
            headers=lawyer_headers,
            json={"role": "FIRM_ADMIN"},
        )
        assert resp.status_code == 403


# ─────────────────────────────────────────────────────────────────────────────
# TC25 — Désactivation d'un membre
# ─────────────────────────────────────────────────────────────────────────────

class TestDeactivateMember:

    def test_tc25_cannot_deactivate_self(self, admin_headers, registered_firm):
        """L'admin ne peut pas désactiver son propre compte → 400."""
        admin_id = registered_firm["user"]["id"]
        resp = requests.delete(
            api(f"/api/firm/team/{admin_id}"),
            headers=admin_headers,
        )
        assert resp.status_code == 400
        assert "yourself" in resp.json()["detail"].lower()

    def test_tc25b_lawyer_cannot_deactivate(self, lawyer_headers, lawyer_user_id):
        """Un avocat ne peut pas désactiver un membre → 403."""
        resp = requests.delete(
            api(f"/api/firm/team/{lawyer_user_id}"),
            headers=lawyer_headers,
        )
        assert resp.status_code == 403

    def test_tc25c_deactivate_nonexistent_member(self, admin_headers):
        """Désactiver un ID inexistant → 404."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = requests.delete(
            api(f"/api/firm/team/{fake_id}"),
            headers=admin_headers,
        )
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# TC26–TC27 — Identité visuelle (Branding)
# ─────────────────────────────────────────────────────────────────────────────

class TestBranding:

    def test_tc26_get_branding(self, admin_headers):
        """GET /firm/branding retourne la configuration visuelle (peut être vide)."""
        resp = requests.get(api("/api/firm/branding"), headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)

    def test_tc27_update_branding(self, admin_headers):
        """PUT /firm/branding met à jour l'identité visuelle du cabinet."""
        resp = requests.put(api("/api/firm/branding"), headers=admin_headers, json={
            "primary_color": "#003366",
            "display_name": "Cabinet Test Automatisé",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["primary_color"] == "#003366"
        assert data["display_name"] == "Cabinet Test Automatisé"

    def test_tc27b_update_branding_idempotent(self, admin_headers):
        """Deux mises à jour successives (upsert) fonctionnent sans erreur."""
        for color in ("#112233", "#445566"):
            resp = requests.put(api("/api/firm/branding"), headers=admin_headers, json={
                "primary_color": color,
            })
            assert resp.status_code == 200
            assert resp.json()["primary_color"] == color

    def test_tc27c_lawyer_cannot_update_branding(self, lawyer_headers):
        """Un avocat ne peut pas modifier l'identité visuelle → 403."""
        resp = requests.put(api("/api/firm/branding"), headers=lawyer_headers, json={
            "primary_color": "#FF0000",
        })
        assert resp.status_code == 403

    def test_tc27d_update_branding_empty(self, admin_headers):
        """Corps vide → 400."""
        resp = requests.put(api("/api/firm/branding"), headers=admin_headers, json={})
        assert resp.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# TC28 — Code cabinet
# ─────────────────────────────────────────────────────────────────────────────

class TestOfficeCodeEndpoint:

    def test_tc28_get_office_code(self, admin_headers, office_code):
        """GET /firm/office-code retourne le code unique du cabinet."""
        resp = requests.get(api("/api/firm/office-code"), headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "office_code" in data
        assert data["office_code"] == office_code

    def test_tc28b_lawyer_cannot_get_office_code(self, lawyer_headers):
        """Un avocat ne peut pas voir le code cabinet → 403."""
        resp = requests.get(api("/api/firm/office-code"), headers=lawyer_headers)
        assert resp.status_code == 403


# ─────────────────────────────────────────────────────────────────────────────
# TC29 — Statistiques globales du cabinet
# ─────────────────────────────────────────────────────────────────────────────

class TestFirmStats:

    def test_tc29_get_firm_stats(self, admin_headers):
        """GET /firm/stats retourne les statistiques agrégées du cabinet."""
        resp = requests.get(api("/api/firm/stats"), headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "active_cases" in data
        assert "closed_cases" in data
        assert "total_members" in data
        assert "total_clients" in data
        assert "total_documents" in data
        # At least 2 members (admin + lawyer)
        assert data["total_members"] >= 2

    def test_tc29b_lawyer_cannot_get_stats(self, lawyer_headers):
        """Un avocat n'a pas accès aux statistiques globales → 403."""
        resp = requests.get(api("/api/firm/stats"), headers=lawyer_headers)
        assert resp.status_code == 403
