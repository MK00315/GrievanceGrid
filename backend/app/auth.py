from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.models import AuthSession, Role, User
from app.schemas import Login, Register, TokenOut, UserOut
from app.security import (
    Credentials,
    CurrentUser,
    Database,
    dummy_hash,
    new_session,
    password_hasher,
    token_digest,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: Register, db: Database):
    user = User(
        email=str(data.email).lower(),
        name=data.name,
        password_hash=password_hasher.hash(data.password),
        role=Role.CITIZEN,
        jurisdiction_id=get_settings().jurisdiction_id,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Account cannot be registered with these details") from None
    return user


@router.post("/login", response_model=TokenOut)
def login(data: Login, db: Database):
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    valid = password_hasher.verify(data.password, user.password_hash if user else dummy_hash)
    if user is None or not valid or not user.active:
        raise HTTPException(401, "Email or password is incorrect")
    token, expires = new_session(db, user)
    return TokenOut(access_token=token, expires_at=expires, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/logout", status_code=204)
def logout(user: CurrentUser, credentials: Credentials, db: Database):
    session = db.get(AuthSession, token_digest(credentials.credentials))
    if session:
        db.delete(session)
        db.commit()
    return Response(status_code=204)
