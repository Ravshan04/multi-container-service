import mongoose from "mongoose";
import { createApp } from "./app.js";

const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) throw new Error("MONGO_URL must be configured");

await mongoose.connect(mongoUrl);

const port = Number(process.env.PORT ?? 3000);
const server = createApp().listen(port, "0.0.0.0", () => {
  console.log(`Todo API listening on port ${port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

