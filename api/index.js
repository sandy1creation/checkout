import * as build from "../build/server/index.js";
import { createRequestHandler } from "@react-router/express";

// Verify build object has required properties
if (!build || !build.entry || !build.routes) {
  console.error("Build object is missing required properties:", {
    hasBuild: !!build,
    hasEntry: !!build?.entry,
    hasRoutes: !!build?.routes,
    buildKeys: build ? Object.keys(build) : []
  });
}

let handler;

try {
  handler = createRequestHandler({
    build,
    mode: process.env.NODE_ENV,
  });
} catch (error) {
  console.error("Failed to initialize handler:", error);
  console.error("Error details:", {
    message: error.message,
    stack: error.stack,
    buildType: typeof build,
    buildKeys: build ? Object.keys(build) : []
  });
}

// Vercel serverless function handler
export default async function(req, res) {
  if (!handler) {
    try {
      handler = createRequestHandler({
        build,
        mode: process.env.NODE_ENV,
      });
    } catch (error) {
      console.error("Failed to create handler:", error);
      return res.status(500).json({ 
        error: "Server initialization failed",
        message: error.message 
      });
    }
  }

  try {
    await handler(req, res, () => {
      // If handler doesn't respond, send 404
      if (!res.headersSent) {
        res.status(404).send("Not Found");
      }
    });
  } catch (error) {
    console.error("Handler error:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal Server Error",
        message: error.message 
      });
    }
  }
}

