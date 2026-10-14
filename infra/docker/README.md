# Local data services

This Compose file runs only PostgreSQL and Redis. From the repository root, use:

```powershell
docker compose --env-file .env -f infra/docker/compose.yml up -d
```

It reads the existing root `.env` and keeps both services bound to loopback by default. Stop them with:

```powershell
docker compose --env-file .env -f infra/docker/compose.yml down
```

The named volumes persist database and Redis data. Avoid `down --volumes` unless you intend to delete that data. Do not run this file alongside the root `docker-compose.yml` with the default ports; that file also defines PostgreSQL and Redis.
