import express from "express";
import mongoose from "mongoose";

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
