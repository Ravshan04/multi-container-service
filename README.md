# Multi-Container Service

Project page: [Multi-Container Application](https://roadmap.sh/projects/multi-container-service)

Solution repository: https://github.com/Ravshan04/multi-container-service

Live API: http://3.250.91.5/todos

Production-style Todo API running as a Docker Compose stack with Node.js,
MongoDB, and an Nginx reverse proxy.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/todos` | List todos |
| `POST` | `/todos` | Create a todo |
| `GET` | `/todos/:id` | Read a todo |
| `PUT` | `/todos/:id` | Update a todo |
| `DELETE` | `/todos/:id` | Delete a todo |
| `GET` | `/health` | Check API and database connectivity |

Example body: `{ "title": "Learn Docker Compose", "completed": false }`.

## Run locally

```sh
cp .env.example .env
docker compose up --build -d
curl http://localhost/todos
curl -X POST http://localhost/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":"Learn Docker Compose"}'
docker compose down
```

The named `mongo_data` volume preserves todos across container restarts and
`docker compose down`. Use `docker compose down -v` only to delete the data.

## Infrastructure and deployment

- `terraform/` provisions an Ubuntu EC2 instance with HTTP and SSH access.
- `ansible/configure.yml` installs Docker and Compose and prepares the host.
- GitHub Actions tests the app, pushes the image to GHCR, uploads the Compose
  configuration, runs `docker compose up -d`, and verifies the API.
- Nginx runs inside Compose and exposes the API on public port 80.

Required GitHub secrets: `SERVER_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`,
`MONGO_ROOT_USERNAME`, and `MONGO_ROOT_PASSWORD`.
