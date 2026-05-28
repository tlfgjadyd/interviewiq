from pydantic import BaseModel


class GoogleLoginRequest(BaseModel):
    idToken: str


class AuthUser(BaseModel):
    id: str
    email: str
    name: str
    avatarUrl: str | None = None


class GoogleLoginResponse(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    expiresIn: int
    user: AuthUser
