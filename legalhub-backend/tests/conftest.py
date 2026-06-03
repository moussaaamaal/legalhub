"""
Shared fixtures for Chapter 2 integration tests.
All tests run against a locally running server: http://localhost:8000
Use a unique timestamp suffix on emails to avoid conflicts between runs.
"""

import time
import pytest
import requests

BASE_URL = "http://localhost:8000"
TS = str(int(time.time()))  # unique suffix per test session


def api(path: str) -> str:
    return f"{BASE_URL}{path}"


# ─── Admin firm fixture (created once per session) ────────────────────────────

@pytest.fixture(scope="session")
def admin_credentials():
    return {
        "email": f"admin_{TS}@testlegalhub.com",
        "password": "Admin@12345",
        "full_name": "Test Admin",
        "firm_name": f"Cabinet Test {TS}",
        "legal_entity_type": "SARL",
    }


@pytest.fixture(scope="session")
def registered_firm(admin_credentials):
    """Register a new firm and return the full response (includes tokens + office_code)."""
    resp = requests.post(api("/api/auth/register-firm"), json={
        "firm_name": admin_credentials["firm_name"],
        "legal_entity_type": admin_credentials["legal_entity_type"],
        "email": admin_credentials["email"],
        "password": admin_credentials["password"],
        "full_name": admin_credentials["full_name"],
    })
    assert resp.status_code == 201, f"register-firm failed: {resp.text}"
    return resp.json()


@pytest.fixture(scope="session")
def admin_token(registered_firm):
    return registered_firm["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def office_code(registered_firm):
    return registered_firm["office_code"]


@pytest.fixture(scope="session")
def admin_firm_id(registered_firm):
    return registered_firm["firm_id"]


# ─── Second lawyer fixture (joins via office code) ────────────────────────────

@pytest.fixture(scope="session")
def lawyer_credentials():
    return {
        "email": f"lawyer_{TS}@testlegalhub.com",
        "password": "Lawyer@12345",
        "full_name": "Test Lawyer",
    }


@pytest.fixture(scope="session")
def registered_lawyer(lawyer_credentials, office_code, registered_firm):
    """Lawyer joins the firm using the office code."""
    resp = requests.post(api("/api/auth/office-code/validate"), json={
        "code": office_code,
        "email": lawyer_credentials["email"],
        "password": lawyer_credentials["password"],
        "full_name": lawyer_credentials["full_name"],
    })
    assert resp.status_code == 200, f"office-code/validate failed: {resp.text}"
    return resp.json()


@pytest.fixture(scope="session")
def lawyer_token(registered_lawyer):
    return registered_lawyer["access_token"]


@pytest.fixture(scope="session")
def lawyer_headers(lawyer_token):
    return {"Authorization": f"Bearer {lawyer_token}"}


@pytest.fixture(scope="session")
def lawyer_user_id(registered_lawyer):
    return registered_lawyer["user"]["id"]
