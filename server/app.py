import hashlib
import json
import os
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import game, decks, papermill, fishing
from .db import connect, init, transaction
from .providers import ASSETS, process_job

app = FastAPI(title="Trading Cards: Print Shop", version="0.1.0")
HITS = defaultdict(deque)


@app.exception_handler(game.GameError)
async def game_error(_request, exc):
    return JSONResponse({"detail": exc.message}, status_code=exc.status)


@app.on_event("startup")
def startup():
    init()
    game.seed()
    ASSETS.mkdir(parents=True, exist_ok=True)
    with transaction() as db:
        db.execute("UPDATE jobs SET status='pending' WHERE status='working'")
        jobs = [r[0] for r in db.execute("SELECT id FROM jobs WHERE status='pending'")]
    for job_id in jobs:
        # A crashed process may have left a reserved job. Resume it.
        import threading
        threading.Thread(target=process_job, args=(job_id,), daemon=True).start()


def rate_limit(key, count=20, period=60):
    q = HITS[key]
    current = time.monotonic()
    while q and current - q[0] > period:
        q.popleft()
    if len(q) >= count:
        raise HTTPException(429, "Too many requests")
    q.append(current)


def session_user(request: Request, mutate=False, admin=False):
    token = request.cookies.get("cards_session")
    if not token:
        raise HTTPException(401, "Sign in required")
    digest = hashlib.sha256(token.encode()).hexdigest()
    with connect() as db:
        row = db.execute("SELECT u.id,u.username,u.is_admin,u.starter_deck_id,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id "
                         "WHERE s.token_hash=? AND s.expires_at>?", (digest, game.stamp())).fetchone()
    if not row:
        raise HTTPException(401, "Session expired")
    user = dict(row)
    if admin and not user["is_admin"]:
        raise HTTPException(403, "Admin required")
    if mutate and request.headers.get("X-CSRF-Token") != user["csrf"]:
        raise HTTPException(403, "Invalid CSRF token")
    return user


async def auth(request: Request):
    return session_user(request)


async def mutation(request: Request):
    return session_user(request, mutate=True)


async def admin_mutation(request: Request):
    return session_user(request, mutate=True, admin=True)


class Credentials(BaseModel):
    username: str
    password: str


class Registration(Credentials):
    starter_deck_id: str


def start_session(response: Response, user_id):
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    expiry = (game.now() + timedelta(days=14)).isoformat()
    with transaction() as db:
        db.execute("INSERT INTO sessions VALUES(?,?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user_id, csrf, expiry))
        user = db.execute("SELECT id,username,is_admin,starter_deck_id FROM users WHERE id=?", (user_id,)).fetchone()
    response.set_cookie("cards_session", token, httponly=True, secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
                        samesite="lax", max_age=14*86400)
    return {**dict(user), "csrf": csrf}


@app.get("/api/starter-decks")
async def starter_decks():
    with connect() as db:
        return game.starter_decks(db)


@app.post("/api/auth/register")
async def register(payload: Registration, request: Request, response: Response):
    rate_limit("register:" + request.client.host, 5, 3600)
    with transaction() as db:
        user_id = game.create_user(db, payload.username, payload.password, starter_deck_id=payload.starter_deck_id)
    return start_session(response, user_id)


@app.post("/api/auth/login")
async def login(payload: Credentials, request: Request, response: Response):
    rate_limit("login:" + request.client.host, 10, 300)
    with connect() as db:
        user = db.execute("SELECT * FROM users WHERE username=? COLLATE NOCASE", (payload.username,)).fetchone()
    if not user or not game.verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    return start_session(response, user["id"])


@app.get("/api/auth/me")
async def me(user=Depends(auth)):
    return user


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response, user=Depends(mutation)):
    token = request.cookies.get("cards_session")
    with transaction() as db:
        db.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))
    response.delete_cookie("cards_session")
    return {"ok": True}


@app.get("/api/catalog")
async def catalog(user=Depends(auth)):
    with connect() as db:
        return game.catalogue(db, user["id"])


@app.get("/api/state")
async def state(user=Depends(auth)):
    with transaction() as db:
        resources = game.resource_balance(db, user["id"])
        library = game.library(db, user["id"])
        commissions = []
        for row in db.execute("SELECT * FROM commissions WHERE active=1"):
            item = dict(row)
            item["requirement"], item["reward"] = json.loads(item["requirement"]), json.loads(item["reward"])
            claim = db.execute("SELECT count FROM commission_claims WHERE user_id=? AND commission_id=? AND day=?",
                               (user["id"], item["id"], game.day())).fetchone()
            item["claimed"] = claim[0] if claim else 0
            commissions.append(item)
        npcs = []
        for row in db.execute("SELECT * FROM npc_offers WHERE active=1"):
            item = dict(row)
            if not game.npc_offer_available(item["id"], user["id"]):
                continue
            item["requirement"], item["reward"] = json.loads(item["requirement"]), json.loads(item["reward"])
            item["claimed"] = bool(db.execute("SELECT 1 FROM npc_claims WHERE user_id=? AND offer_id=? AND day=?",
                                              (user["id"], item["id"], game.day())).fetchone())
            npcs.append(item)
        return {"resources": resources, "library": library, "catalog": game.catalogue(db, user["id"]),
                "collection_progress": game.collection_progress(db, user["id"]),
                "commissions": commissions, "npcs": npcs, "generation_count": game.generation_count(db, user["id"]),
                "generation_limit": int(os.getenv("NEW_DESIGNS_PER_DAY", "5")),
                "allowance_claimed": game.daily_allowance_claimed(db, user["id"])}


class DeckPayload(BaseModel):
    title: str = Field(min_length=1, max_length=64)
    theme: str


@app.get("/api/decks")
async def deck_list(user=Depends(auth)):
    with transaction() as db:
        return decks.list_decks(db, user["id"])


@app.post("/api/decks")
async def create_deck(payload: DeckPayload, user=Depends(mutation)):
    with transaction() as db:
        deck_id = decks.create_custom(db, user["id"], payload.title, payload.theme)
        return {"id": deck_id}


@app.put("/api/decks/{deck_id}")
async def update_deck(deck_id: str, payload: DeckPayload, user=Depends(mutation)):
    with transaction() as db:
        decks.update_custom(db, user["id"], deck_id, payload.title, payload.theme)
        return {"ok": True}


@app.delete("/api/decks/{deck_id}")
async def delete_deck(deck_id: str, user=Depends(mutation)):
    with transaction() as db:
        decks.delete_custom(db, user["id"], deck_id)
        return {"ok": True}


@app.post("/api/decks/{deck_id}/claim")
async def claim_deck(deck_id: str, user=Depends(mutation)):
    with transaction() as db:
        return decks.claim_reward(db, user["id"], deck_id)


class FishingReelPayload(BaseModel):
    cast_id: str


@app.get("/api/games/fishing")
async def fishing_status(user=Depends(auth)):
    with transaction() as db:
        return fishing.state(db, user["id"])


@app.post("/api/games/fishing/cast")
async def fishing_cast(user=Depends(mutation)):
    with transaction() as db:
        return fishing.cast(db, user["id"])


@app.post("/api/games/fishing/reel")
async def fishing_reel(payload: FishingReelPayload, user=Depends(mutation)):
    with transaction() as db:
        return fishing.reel(db, user["id"], payload.cast_id)


@app.get("/api/games/papermill")
async def papermill_status(user=Depends(auth)):
    with transaction() as db:
        return papermill.status(db, user["id"])


@app.post("/api/games/papermill/tap")
async def papermill_tap(user=Depends(mutation)):
    with transaction() as db:
        return papermill.tap(db, user["id"])


@app.post("/api/games/papermill/hire")
async def papermill_hire(user=Depends(mutation)):
    with transaction() as db:
        return papermill.hire(db, user["id"])


@app.post("/api/games/papermill/upgrades/{kind}")
async def papermill_upgrade(kind: str, user=Depends(mutation)):
    with transaction() as db:
        return papermill.upgrade(db, user["id"], kind)


@app.post("/api/allowance/claim")
async def allowance(user=Depends(mutation)):
    with transaction() as db:
        return {"reward": game.claim_daily_allowance(db, user["id"])}


@app.get("/api/copies/{copy_id}")
async def copy_detail(copy_id: str, user=Depends(auth)):
    with transaction() as db:
        return game.copy_detail(db, copy_id, user["id"])


class PrintPayload(BaseModel):
    hint: str = Field(default="", max_length=254)
    type_id: str
    rule_ids: list[str]
    theme_id: str
    finish_id: str = "standard"
    border_id: str = "classic"
    back_id: str = "archive"


@app.post("/api/prints")
async def print_design(payload: PrintPayload, request: Request, user=Depends(mutation)):
    rate_limit("print:" + str(user["id"]), 8, 3600)
    key = request.headers.get("Idempotency-Key", "")
    with transaction() as db:
        job = game.create_print_job(db, user["id"], payload.model_dump(), key)
    if job["status"] == "pending":
        import threading
        threading.Thread(target=process_job, args=(job["id"],), daemon=True).start()
    return job


class PhysicalPrintItem(BaseModel):
    copy_id: str
    quantity: int = Field(ge=1, le=90)


class PhysicalPrintPayload(BaseModel):
    items: list[PhysicalPrintItem]


@app.post("/api/physical-prints")
async def physical_print(payload: PhysicalPrintPayload, request: Request, user=Depends(mutation)):
    key = request.headers.get("Idempotency-Key", "")
    with transaction() as db:
        return game.charge_physical_print(db, user["id"], [item.model_dump() for item in payload.items], key)


@app.get("/api/jobs/{job_id}")
async def job_status(job_id: str, user=Depends(auth)):
    with connect() as db:
        row = db.execute("SELECT * FROM jobs WHERE id=? AND user_id=?", (job_id, user["id"])).fetchone()
        if not row:
            raise HTTPException(404, "Job not found")
        return dict(row)


class CopyPayload(BaseModel):
    copy_id: str


@app.post("/api/copies/{copy_id}/reprint")
async def reprint(copy_id: str, user=Depends(mutation)):
    with transaction() as db:
        return {"copy_id": game.reprint(db, user["id"], copy_id)}


@app.post("/api/copies/{copy_id}/study")
async def study(copy_id: str, user=Depends(mutation)):
    with transaction() as db:
        return {"learned": game.study(db, user["id"], copy_id)}


@app.post("/api/copies/{copy_id}/sleeve")
async def sleeve(copy_id: str, user=Depends(mutation)):
    with transaction() as db:
        game.sleeve(db, user["id"], copy_id)
    return {"ok": True}


@app.post("/api/copies/{copy_id}/certify")
async def certify(copy_id: str, user=Depends(mutation)):
    with transaction() as db:
        return {"grade": game.certify(db, user["id"], copy_id)}


@app.post("/api/copies/{copy_id}/crack")
async def crack(copy_id: str, user=Depends(mutation)):
    with transaction() as db:
        game.crack(db, user["id"], copy_id)
    return {"ok": True}


@app.post("/api/commissions/{commission_id}/claim")
async def claim_commission(commission_id: str, payload: CopyPayload, user=Depends(mutation)):
    with transaction() as db:
        return {"reward": game.commission_claim(db, user["id"], commission_id, payload.copy_id)}


class NpcPayload(BaseModel):
    copy_id: str | None = None


@app.post("/api/npcs/{offer_id}/trade")
async def trade_npc(offer_id: str, payload: NpcPayload, user=Depends(mutation)):
    with transaction() as db:
        return game.npc_trade(db, user["id"], offer_id, payload.copy_id)


def listing_detail(db, row, user_id):
    item = dict(row)
    item["card"] = game.copy_detail(db, item["copy_id"], user_id)
    item["offers"] = []
    if item["seller_id"] == user_id:
        for offer in db.execute("SELECT * FROM offers WHERE listing_id=? ORDER BY created_at DESC", (item["id"],)):
            entry = dict(offer)
            entry["copy_ids"] = json.loads(entry["copy_ids"])
            entry["cards"] = [game.copy_detail(db, cid, user_id) for cid in entry["copy_ids"]]
            item["offers"].append(entry)
    return item


@app.get("/api/market")
async def market(user=Depends(auth)):
    with transaction() as db:
        return [listing_detail(db, r, user["id"]) for r in db.execute("SELECT l.*,u.username seller FROM listings l "
                                                               "JOIN users u ON u.id=l.seller_id WHERE l.status='open' ORDER BY l.created_at DESC")]


class ListingPayload(BaseModel):
    copy_id: str
    wish: str


@app.post("/api/market/listings")
async def list_copy(payload: ListingPayload, user=Depends(mutation)):
    with transaction() as db:
        return {"listing_id": game.make_listing(db, user["id"], payload.copy_id, payload.wish)}


@app.post("/api/market/listings/{listing_id}/cancel")
async def cancel_listing(listing_id: str, user=Depends(mutation)):
    with transaction() as db:
        row = db.execute("SELECT * FROM listings WHERE id=? AND seller_id=? AND status='open'", (listing_id, user["id"])).fetchone()
        game.need(row is not None, "Listing unavailable", 404)
        db.execute("UPDATE listings SET status='cancelled' WHERE id=?", (listing_id,))
        db.execute("UPDATE copies SET listed=0 WHERE id=?", (row["copy_id"],))
        db.execute("UPDATE offers SET status='declined' WHERE listing_id=? AND status='open'", (listing_id,))
    return {"ok": True}


class OfferPayload(BaseModel):
    copy_ids: list[str]


@app.post("/api/market/listings/{listing_id}/offers")
async def offer(listing_id: str, payload: OfferPayload, user=Depends(mutation)):
    with transaction() as db:
        return {"offer_id": game.make_offer(db, user["id"], listing_id, payload.copy_ids)}


@app.post("/api/market/offers/{offer_id}/accept")
async def accept(offer_id: str, user=Depends(mutation)):
    with transaction() as db:
        return game.accept_offer(db, user["id"], offer_id)


class AdminPayload(BaseModel):
    action: str
    payload: dict
    reason: str


@app.get("/api/admin/overview")
async def admin_overview(request: Request):
    user = session_user(request, admin=True)
    with connect() as db:
        return {"users": [{**dict(r), "collection_progress": game.collection_progress(db, r["id"])}
                          for r in db.execute("SELECT id,username,is_admin,created_at FROM users ORDER BY id DESC")],
                "designs": [dict(r) for r in db.execute("SELECT id,name,type_id,finish_id FROM designs ORDER BY created_at DESC LIMIT 100")],
                "audit": [dict(r) for r in db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 50")]}


@app.post("/api/admin/actions")
async def admin_actions(body: AdminPayload, user=Depends(admin_mutation)):
    with transaction() as db:
        return game.admin_action(db, user["id"], body.action, body.payload, body.reason)


@app.get("/api/health")
async def health():
    return {"ok": True}


ASSETS.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=ASSETS), name="assets")


@app.get("/{path:path}", include_in_schema=False)
async def frontend(path: str):
    root = Path(__file__).resolve().parent.parent / "web" / "dist"
    file = (root / path).resolve()
    if root.exists() and file.is_relative_to(root.resolve()) and file.is_file():
        return FileResponse(file)
    if (root / "index.html").exists():
        return FileResponse(root / "index.html")
    return JSONResponse({"message": "Run the Vite dev server or build the frontend."})
