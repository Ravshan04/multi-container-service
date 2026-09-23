import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health endpoint requests are recorded with bounded route and status labels", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 503, "the test has no MongoDB connection");
  assert.equal((await health.json()).status, "unavailable");

  const metricsResponse = await fetch(`${baseUrl}/metrics`);
  assert.equal(metricsResponse.status, 200);
  assert.match(metricsResponse.headers.get("content-type"), /text\/plain/);
  const metrics = await metricsResponse.text();
  assert.match(metrics, /todo_api_http_requests_total\{method="GET",route="\/health",status_code="503"\} 1/);
  assert.match(metrics, /todo_api_http_request_duration_seconds_bucket/);
  assert.match(metrics, /todo_api_process_cpu_user_seconds_total/);
  assert.match(metrics, /todo_api_info\{version="local"\} 1/);
});
