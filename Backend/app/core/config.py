from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    METRICS_JWT_SECRET: str = "cambiar-esta-clave"
    CORS_ORIGINS: str = "http://localhost:5175"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12
    TIMEZONE: str = "America/Lima"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
