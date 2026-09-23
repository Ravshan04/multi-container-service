# Blue-Green Deployment for a Multi-Container Service

Project page: [Blue-Green Deployment](https://roadmap.sh/projects/blue-green-deployment)

Monitoring project: [Prometheus and Grafana](https://roadmap.sh/projects/monitoring)

Base application: [Multi-Container Service](https://roadmap.sh/projects/multi-container-service)

Live API: http://3.250.91.5/todos

Todo API running as a Docker Compose stack with Node.js, MongoDB, and Nginx.
Nginx routes traffic to one of two API containers (`api-blue` or `api-green`).
The inactive slot starts first and must pass its container health check before
Nginx switches traffic. A failed post-switch health check restores the previous
route and leaves the old API container running.

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

## Deploy locally

```sh
cp .env.example .env
bash scripts/deploy-blue-green.sh
curl http://localhost/health
curl http://localhost/todos
```

Run `bash scripts/deploy-blue-green.sh` again to deploy to the other color. The
script waits for MongoDB and the candidate API to become healthy, switches
Nginx, checks the public health route, then stops the previously active API.
It stores the active color in `state/active-color` so future deployments and
host restarts preserve the correct slot. Both API containers use the same
MongoDB database and the named `mongo_data` volume, preserving todos across
deployments and container restarts.

Use `docker compose down` to stop the stack. Use `docker compose down -v` only
to delete the application data and monitoring history.

## Infrastructure and deployment

- `terraform/` provisions an Ubuntu EC2 instance with HTTP and SSH access.
- `ansible/configure.yml` installs Docker and Compose and prepares the host.
- GitHub Actions tests the app, pushes the image to GHCR, uploads the Compose
  configuration, deploys to the inactive color, and verifies the API.
- Prometheus scrapes custom API request and latency metrics through the active
  Nginx route, probes `/health` with Blackbox Exporter, collects host metrics
  with Node Exporter, and collects MongoDB metrics with the MongoDB exporter.
  It evaluates application, host, and database alerts and retains 15 days of
  history.
- Grafana provisions Prometheus as a data source and loads the Todo Service
  dashboard for API request rate, p95 latency, health, CPU, and memory.
- Prometheus and Grafana bind to loopback ports 9090 and 3001. Access them over
  SSH tunnels:

  ```sh
  ssh -L 9090:127.0.0.1:9090 -L 3001:127.0.0.1:3001 <user>@<server>
  ```

  Then open `http://localhost:9090` or `http://localhost:3001`. Grafana requires
  the credentials configured by `GRAFANA_ADMIN_USER` and
  `GRAFANA_ADMIN_PASSWORD`. Anonymous access and sign-up are disabled.
- Nginx is the public traffic switch and exposes the API on port 80.

Required GitHub secrets: `SERVER_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`,
`MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, and `GRAFANA_ADMIN_PASSWORD`.

For local setup, copy `.env.example` to `.env`, set unique database and Grafana
passwords, and run `bash scripts/deploy-blue-green.sh`. The same script starts
Prometheus, Grafana, and all exporters on the first deployment.
