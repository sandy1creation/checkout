import * as build from "../build/server/index.js";
import { createRequestHandler } from "@react-router/express";

const handler = createRequestHandler({
  build,
  mode: process.env.NODE_ENV,
});

// Vercel serverless function handler
export default async function(req, res) {
  return handler(req, res, () => {
    res.status(404).send("Not Found");
  });
}

