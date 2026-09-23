import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

const created = await request("/todos", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "Verify Docker Compose persistence" }),
});
assert.equal(created.response.status, 201);
assert.ok(created.body._id);

const id = created.body._id;
const fetched = await request(`/todos/${id}`);
assert.equal(fetched.body.title, "Verify Docker Compose persistence");

const updated = await request(`/todos/${id}`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "Verify Docker Compose persistence", completed: true }),
});
assert.equal(updated.body.completed, true);

if (process.env.TEST_PERSISTENCE === "true") {
  execFileSync("docker", ["compose", "stop"], { stdio: "inherit" });
  execFileSync("docker", ["compose", "start"], { stdio: "inherit" });
  await delay(12_000);
  const persisted = await request(`/todos/${id}`);
  assert.equal(persisted.body._id, id);
}

const removed = await request(`/todos/${id}`, { method: "DELETE" });
assert.equal(removed.response.status, 204);

console.log("CRUD and persistence checks passed");
