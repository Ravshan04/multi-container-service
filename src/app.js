import express from "express";
import mongoose from "mongoose";
import promClient from "prom-client";

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry, prefix: "todo_api_" });
const httpRequests = new promClient.Counter({
  name: "todo_api_http_requests_total",
  help: "Total HTTP requests handled by the Todo API.",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});
const httpDuration = new promClient.Histogram({
  name: "todo_api_http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});
const applicationInfo = new promClient.Gauge({
  name: "todo_api_info",
  help: "Build metadata for the API receiving traffic.",
  labelNames: ["version"],
  registers: [registry],
});
applicationInfo.set({ version: process.env.APP_VERSION ?? "local" }, 1);

const todoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

export const Todo = mongoose.model("Todo", todoSchema);

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.use((request, response, next) => {
    const end = httpDuration.startTimer();
    response.on("finish", () => {
      const labels = {
        method: request.method,
        route: request.route?.path ? `${request.baseUrl}${request.route.path}` : (request.path === "/health" ? "/health" : "unmatched"),
        status_code: String(response.statusCode),
      };
      httpRequests.inc(labels);
      end(labels);
    });
    next();
  });

  app.get("/metrics", async (_request, response) => {
    response.set("Content-Type", registry.contentType);
    response.end(await registry.metrics());
  });

  app.get("/health", (_request, response) => {
    const connected = mongoose.connection.readyState === 1;
    response.status(connected ? 200 : 503).json({
      status: connected ? "ok" : "unavailable",
      version: process.env.APP_VERSION ?? "local",
    });
  });

  app.get("/todos", async (_request, response, next) => {
    try {
      response.json(await Todo.find().sort({ createdAt: -1 }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/todos", async (request, response, next) => {
    try {
      const todo = await Todo.create({ title: request.body.title, completed: request.body.completed });
      response.status(201).json(todo);
    } catch (error) {
      next(error);
    }
  });

  app.get("/todos/:id", async (request, response, next) => {
    try {
      const todo = await Todo.findById(request.params.id);
      if (!todo) return response.status(404).json({ error: "Todo not found" });
      response.json(todo);
    } catch (error) {
      next(error);
    }
  });

  app.put("/todos/:id", async (request, response, next) => {
    try {
      const todo = await Todo.findByIdAndUpdate(
        request.params.id,
        { title: request.body.title, completed: request.body.completed },
        { new: true, runValidators: true },
      );
      if (!todo) return response.status(404).json({ error: "Todo not found" });
      response.json(todo);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/todos/:id", async (request, response, next) => {
    try {
      const todo = await Todo.findByIdAndDelete(request.params.id);
      if (!todo) return response.status(404).json({ error: "Todo not found" });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof mongoose.Error.CastError) {
      return response.status(400).json({ error: "Invalid todo id" });
    }
    if (error instanceof mongoose.Error.ValidationError) {
      return response.status(400).json({ error: error.message });
    }
    console.error(error);
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}
