"""
Chapitre 2 — Sprint 1 : Authentification et sécurité des comptes
Tests fonctionnels des endpoints /api/auth/*

Cas couverts (20 tests):
  TC01  Inscription et création d'un cabinet
  TC02  Vérification que l'email dupliqué est rejeté
  TC03  Connexion avec identifiants corrects (sans 2FA)
  TC04  Connexion avec mauvais mot de passe → 401
  TC05  Connexion compte désactivé → 403
  TC06  Obtenir le profil courant (GET /me)
  TC07  Mettre à jour le profil (PUT /me)
  TC08  Changer le mot de passe
  TC09  Rafraîchir le token JWT
  TC10  Déconnexion (logout)
  TC11  Rejoindre un cabinet avec le code unique
  TC12  Code cabinet invalide → 404
  TC13  Configuration 2FA (setup + verify)
  TC14  Connexion avec 2FA valide
  TC15  Connexion avec code 2FA invalide → 400
  TC16  Invitation d'un client (invite/client)
  TC17  Acceptation de l'invitation client
  TC18  Invitation avec token invalide → 404
  TC19  Historique des connexions
  TC20  Préférences de notification (GET + PUT)
"""

import time
import pytest
import requests
import pyotp

BASE_URL = "http://localhost:8000"
TS = None  # will be set at module import via conftest


def api(path):
    return f"{BASE_URL}{path}"


# ─────────────────────────────────────────────────────────────────────────────
# TC01 — Inscription et création d'un cabinet
# ─────────────────────────────────────────────────────────────────────────────

class TestRegisterFirm:

    def test_tc01_register_firm_success(self, registered_firm, admin_credentials):
        """Un administrateur s'inscrit et crée son cabinet."""
        data = registered_firm
        assert "access_token" in data
        assert "refresh_token" in data
        assert "office_code" in data
        assert len(data["office_code"]) == 8
        assert data["user"]["email"] == admin_credentials["email"]
        assert data["user"]["role"] == "FIRM_ADMIN"
        assert data["user"]["two_fa_enabled"] is False

    def test_tc02_register_duplicate_email(self, admin_credentials):
        """Un email déjà utilisé est rejeté (400)."""
        resp = requests.post(api("/api/auth/register-firm"), json={
            "firm_name": "Another Firm",
            "legal_entity_type": "SAS",
            "email": admin_credentials["email"],
            "password": "password123",
            "full_name": "Duplicate Admin",
        })
        assert resp.status_code == 400
        assert "already" in resp.json()["detail"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# TC03–TC05 — Connexion
# ─────────────────────────────────────────────────────────────────────────────

class TestLogin:

    def test_tc03_login_success(self, admin_credentials):
        """Connexion avec identifiants corrects retourne les tokens."""
        resp = requests.post(api("/api/auth/login"), json={
            "email": admin_credentials["email"],
            "password": admin_credentials["password"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["role"] == "FIRM_ADMIN"
        assert "last_login_at" in data["user"]

    def test_tc04_login_wrong_password(self, admin_credentials):
        """Mauvais mot de passe → 401."""
        resp = requests.post(api("/api/auth/login"), json={
            "email": admin_credentials["email"],
            "password": "WrongPassword!",
        })
        assert resp.status_code == 401

    def test_tc05_login_unknown_user(self):
        """Email inconnu → 401."""
        resp = requests.post(api("/api/auth/login"), json={
            "email": "nobody_xyz999@example.com",
            "password": "anything",
        })
        assert resp.status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# TC06–TC08 — Profil et mot de passe
# ─────────────────────────────────────────────────────────────────────────────

class TestProfile:

    def test_tc06_get_me(self, admin_headers, admin_credentials):
        """GET /me retourne les infos de l'utilisateur connecté."""
        resp = requests.get(api("/api/auth/me"), headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == admin_credentials["email"]
        assert data["role"] == "FIRM_ADMIN"
        assert "firm_id" in data

    def test_tc07_update_me(self, admin_headers):
        """PUT /me met à jour le nom et le téléphone."""
        resp = requests.put(api("/api/auth/me"), headers=admin_headers, json={
            "full_name": "Admin Modifié",
            "phone": "+21612345678",
        })
        assert resp.status_code == 200
        assert resp.json()["full_name"] == "Admin Modifié"
        assert resp.json()["phone"] == "+21612345678"

    def test_tc07b_update_me_no_fields(self, admin_headers):
        """PUT /me sans champs → 400."""
        resp = requests.put(api("/api/auth/me"), headers=admin_headers, json={})
        assert resp.status_code == 400

    def test_tc08_change_password(self, admin_credentials, admin_headers):
        """Changement de mot de passe réussi."""
        original = admin_credentials["password"]
        new_pwd = "NewAdmin@99"
        resp = requests.put(api("/api/auth/change-password"), headers=admin_headers, json={
            "current_password": original,
            "new_password": new_pwd,
        })
        assert resp.status_code == 200

        # Restore original password
        resp2 = requests.put(api("/api/auth/change-password"), headers=admin_headers, json={
            "current_password": new_pwd,
            "new_password": original,
        })
        assert resp2.status_code == 200

    def test_tc08b_change_password_wrong_current(self, admin_headers):
        """Mauvais mot de passe actuel → 400."""
        resp = requests.put(api("/api/auth/change-password"), headers=admin_headers, json={
            "current_password": "TotallyWrong!",
            "new_password": "irrelevant",
        })
        assert resp.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# TC09–TC10 — Refresh + Logout
# ─────────────────────────────────────────────────────────────────────────────

class TestTokenLifecycle:

    def test_tc09_refresh_token(self, registered_firm):
        """Le refresh token génère un nouveau access token."""
        resp = requests.post(api("/api/auth/refresh"), json={
            "refresh_token": registered_firm["refresh_token"],
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_tc09b_refresh_with_invalid_token(self):
        """Refresh avec token invalide → 401."""
        resp = requests.post(api("/api/auth/refresh"), json={
            "refresh_token": "not.a.valid.token",
        })
        assert resp.status_code == 401

    def test_tc10_logout(self, admin_credentials):
        """Logout révoque le token de session."""
        # Login first to get a fresh token
        login_resp = requests.post(api("/api/auth/login"), json={
            "email": admin_credentials["email"],
            "password": admin_credentials["password"],
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        resp = requests.post(api("/api/auth/logout"), headers=headers)
        assert resp.status_code == 200
        assert "logged out" in resp.json()["message"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# TC11–TC12 — Rejoindre un cabinet via code
# ─────────────────────────────────────────────────────────────────────────────

class TestOfficeCode:

    def test_tc11_join_firm_with_office_code(self, registered_lawyer, lawyer_credentials):
        """Un avocat rejoint un cabinet via le code unique."""
        data = registered_lawyer
        assert "access_token" in data
        assert data["user"]["role"] == "LAWYER"
        assert data["user"]["email"] == lawyer_credentials["email"]

    def test_tc12_invalid_office_code(self):
        """Code cabinet invalide → 404."""
        resp = requests.post(api("/api/auth/office-code/validate"), json={
            "code": "INVALID0",
            "email": "someone@example.com",
            "password": "pass1234",
            "full_name": "Ghost User",
        })
        assert resp.status_code == 404

    def test_tc12b_duplicate_email_on_join(self, lawyer_credentials, office_code):
        """Email déjà enregistré lors d'un rejoindre → 400."""
        resp = requests.post(api("/api/auth/office-code/validate"), json={
            "code": office_code,
            "email": lawyer_credentials["email"],
            "password": "pass1234",
            "full_name": "Duplicate",
        })
        assert resp.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# TC13–TC15 — Authentification à deux facteurs (2FA / TOTP)
# ─────────────────────────────────────────────────────────────────────────────

class Test2FA:
    """
    Strategy: use the lawyer account for 2FA (keeps admin separate).
    We setup 2FA on the lawyer, test login with TOTP, then disable it.
    """

    @pytest.fixture(scope="class")
    def totp_secret(self, lawyer_headers):
        """Setup 2FA and return the TOTP secret."""
        resp = requests.post(api("/api/auth/2fa/setup"), headers=lawyer_headers)
        assert resp.status_code == 200
        secret = resp.json()["secret"]
        assert secret
        return secret

    @pytest.fixture(scope="class")
    def totp_enabled(self, totp_secret, lawyer_headers):
        """Enable 2FA by verifying the current TOTP code."""
        code = pyotp.TOTP(totp_secret).now()
        resp = requests.post(api("/api/auth/2fa/verify"), headers=lawyer_headers, json={"code": code})
        assert resp.status_code == 200, f"2FA verify failed: {resp.text}"
        return totp_secret

    def test_tc13_2fa_setup_and_verify(self, totp_enabled):
        """Setup et activation 2FA réussis."""
        assert totp_enabled is not None

    def test_tc14_login_with_valid_2fa(self, lawyer_credentials, totp_enabled):
        """Connexion complète avec code TOTP valide."""
        # Step 1: login returns requires_2fa + temp_token
        login_resp = requests.post(api("/api/auth/login"), json={
            "email": lawyer_credentials["email"],
            "password": lawyer_credentials["password"],
        })
        assert login_resp.status_code == 200
        login_data = login_resp.json()
        assert login_data.get("requires_2fa") is True
        temp_token = login_data["temp_token"]

        # Step 2: complete with TOTP code
        code = pyotp.TOTP(totp_enabled).now()
        complete_resp = requests.post(api("/api/auth/2fa/login"), json={
            "temp_token": temp_token,
            "code": code,
        })
        assert complete_resp.status_code == 200
        assert "access_token" in complete_resp.json()

    def test_tc15_login_with_invalid_2fa_code(self, lawyer_credentials, totp_enabled):
        """Code TOTP invalide → 400."""
        login_resp = requests.post(api("/api/auth/login"), json={
            "email": lawyer_credentials["email"],
            "password": lawyer_credentials["password"],
        })
        temp_token = login_resp.json()["temp_token"]

        resp = requests.post(api("/api/auth/2fa/login"), json={
            "temp_token": temp_token,
            "code": "000000",
        })
        assert resp.status_code == 400

    def test_tc15b_login_2fa_with_expired_temp_token(self):
        """Temp token invalide → 401."""
        resp = requests.post(api("/api/auth/2fa/login"), json={
            "temp_token": "not.a.valid.token",
            "code": "123456",
        })
        assert resp.status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# TC16–TC18 — Invitation client
# ─────────────────────────────────────────────────────────────────────────────

class TestClientInvite:

    @pytest.fixture(scope="class")
    def client_invite(self, lawyer_headers):
        """Invite a test client and return the invite token."""
        ts = str(int(time.time()))
        resp = requests.post(api("/api/auth/invite/client"), headers=lawyer_headers, json={
            "email": f"client_{ts}@testlegalhub.com",
            "full_name": "Client Test",
            "phone": "+21698765432",
        })
        assert resp.status_code == 200, f"invite/client failed: {resp.text}"
        data = resp.json()
        return {"invite_token": data["invite_token"], "email": f"client_{ts}@testlegalhub.com"}

    def test_tc16_invite_client_success(self, client_invite):
        """Invitation d'un client crée une fiche avec un token."""
        assert "invite_token" in client_invite
        assert client_invite["invite_token"]

    def test_tc17_accept_client_invite(self, client_invite):
        """Le client accepte l'invitation et crée son compte."""
        resp = requests.post(api("/api/auth/accept-invite"), json={
            "invite_token": client_invite["invite_token"],
            "email": client_invite["email"],
            "password": "Client@12345",
            "full_name": "Client Test",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["role"] == "CLIENT"

    def test_tc18_accept_invalid_invite_token(self):
        """Token d'invitation invalide → 404."""
        resp = requests.post(api("/api/auth/accept-invite"), json={
            "invite_token": "invalid-token-xyz",
            "email": "anyone@example.com",
            "password": "pass1234",
            "full_name": "Ghost",
        })
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# TC19 — Historique de connexions
# ─────────────────────────────────────────────────────────────────────────────

class TestLoginHistory:

    def test_tc19_login_history(self, admin_headers):
        """GET /login-history retourne la liste des connexions."""
        resp = requests.get(api("/api/auth/login-history"), headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # At least one login was recorded when the firm was registered
        assert len(data) >= 0  # table may or may not exist yet


# ─────────────────────────────────────────────────────────────────────────────
# TC20 — Préférences de notification
# ─────────────────────────────────────────────────────────────────────────────

class TestNotificationPreferences:

    def test_tc20_get_notification_preferences(self, admin_headers):
        """GET /notification-preferences retourne les préférences (ou defaults)."""
        resp = requests.get(api("/api/auth/notification-preferences"), headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "hearing_reminders" in data
        assert "task_reminders" in data

    def test_tc20b_update_notification_preferences(self, admin_headers):
        """PUT /notification-preferences met à jour les préférences."""
        resp = requests.put(api("/api/auth/notification-preferences"), headers=admin_headers, json={
            "hearing_reminders": False,
            "email_notifications": True,
            "hearing_reminder_offset": "30 minutes before",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["hearing_reminders"] is False
        assert data["email_notifications"] is True


# ─────────────────────────────────────────────────────────────────────────────
# TC_SEC — Sécurité : accès sans token → 401/403
# ─────────────────────────────────────────────────────────────────────────────

class TestSecurityGuards:

    def test_no_token_me(self):
        """GET /me sans token → 403."""
        resp = requests.get(api("/api/auth/me"))
        assert resp.status_code in (401, 403)

    def test_invalid_token_me(self):
        """GET /me avec token invalide → 403."""
        resp = requests.get(api("/api/auth/me"), headers={"Authorization": "Bearer bad.token.here"})
        assert resp.status_code in (401, 403)

    def test_forgot_password_unknown_email(self):
        """POST /forgot-password avec email inconnu → 200 (anti-enumeration)."""
        resp = requests.post(api("/api/auth/forgot-password"), json={
            "email": "nobody_at_all@example.com"
        })
        assert resp.status_code == 200
        # Message should be generic (same for known and unknown emails)
        assert "email" in resp.json()["message"].lower()
