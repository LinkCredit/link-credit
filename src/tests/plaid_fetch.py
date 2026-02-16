from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import yaml


ROOT = Path(__file__).resolve().parents[2]


def load_env_from_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def load_config(path: Path) -> Dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@dataclass
class PlaidCredentials:
    client_id: str
    secret: str


class PlaidSandboxClient:
    def __init__(self, config: Dict[str, Any], credentials: PlaidCredentials):
        plaid = config["plaid"]
        self.base_url = plaid["base_url"].rstrip("/")
        self.institution_id = plaid["institution_id"]
        self.initial_products = plaid["initial_products"]
        self.window_days = int(plaid.get("window_days", 30))
        self.credentials = credentials

    def _post(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        body = {
            "client_id": self.credentials.client_id,
            "secret": self.credentials.secret,
            **payload,
        }
        req = Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except HTTPError as err:
            detail = err.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Plaid API error {err.code} at {endpoint}: {detail}") from err

    def create_public_token(self, sandbox_username: str) -> str:
        data = self._post(
            "/sandbox/public_token/create",
            {
                "institution_id": self.institution_id,
                "initial_products": self.initial_products,
                "options": {
                    "override_username": sandbox_username,
                },
            },
        )
        return data["public_token"]

    def exchange_public_token(self, public_token: str) -> str:
        data = self._post(
            "/item/public_token/exchange",
            {"public_token": public_token},
        )
        return data["access_token"]

    def get_balances(self, access_token: str) -> List[Dict[str, Any]]:
        data = self._post("/accounts/balance/get", {"access_token": access_token})
        return data.get("accounts", [])

    def get_transactions(self, access_token: str, window_days: int | None = None) -> List[Dict[str, Any]]:
        days = window_days or self.window_days
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        txs: List[Dict[str, Any]] = []
        offset = 0
        count = 100
        total = None
        while total is None or offset < total:
            data = self._post(
                "/transactions/get",
                {
                    "access_token": access_token,
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "options": {
                        "count": count,
                        "offset": offset,
                    },
                },
            )
            page = data.get("transactions", [])
            txs.extend(page)
            total = int(data.get("total_transactions", len(page)))
            offset += len(page)
            if not page:
                break
        return txs

    def fetch_profile_from_public_token(self, public_token: str) -> Dict[str, Any]:
        access_token = self.exchange_public_token(public_token)
        accounts = self.get_balances(access_token)
        transactions = self.get_transactions(access_token)
        return {
            "accounts": accounts,
            "transactions": transactions,
        }

    def fetch_profile_from_sandbox_user(self, sandbox_username: str) -> Dict[str, Any]:
        public_token = self.create_public_token(sandbox_username)
        profile = self.fetch_profile_from_public_token(public_token)
        profile["public_token"] = public_token
        return profile


def build_client(config_path: Path = ROOT / "config.yaml") -> PlaidSandboxClient:
    load_env_from_dotenv(ROOT / ".env")

    client_id = os.environ.get("PLAID_CLIENT_ID", "")
    secret = os.environ.get("PLAID_SECRET", "")
    if not client_id or not secret:
        raise RuntimeError(
            "Missing PLAID_CLIENT_ID/PLAID_SECRET. Copy .env.example to .env and fill keys."
        )

    config = load_config(config_path)
    creds = PlaidCredentials(client_id=client_id, secret=secret)
    return PlaidSandboxClient(config=config, credentials=creds)


if __name__ == "__main__":
    client = build_client()
    cfg = load_config(ROOT / "config.yaml")
    personas = cfg["plaid"]["sandbox_personas"]
    out: Dict[str, Any] = {}
    for label, username in personas.items():
        profile = client.fetch_profile_from_sandbox_user(username)
        out[label] = {
            "username": username,
            "accounts_count": len(profile["accounts"]),
            "transactions_count": len(profile["transactions"]),
            "public_token": profile["public_token"],
        }
    print(json.dumps(out, indent=2))
