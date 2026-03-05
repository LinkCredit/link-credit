import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  accessTokenHandler,
  createLinkTokenHandler,
  generateRpSignatureHandler,
  healthHandler,
  nextUserHandler,
  triggerScoringHandler,
  triggerWorldIdHandler,
} from "./routes";
import type { EnvBindings } from "./types";

const app = new Hono<{ Bindings: EnvBindings }>();
const DEFAULT_CORS_ORIGIN = "*";

app.use(
  "*",
  cors({
    origin: DEFAULT_CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    maxAge: 86400,
  }),
);

app.get("/health", healthHandler);
app.post("/plaid/link-token", createLinkTokenHandler);
app.post("/trigger-scoring", triggerScoringHandler);
app.post("/trigger-worldid", triggerWorldIdHandler);
app.post("/worldid/rp-signature", generateRpSignatureHandler);
app.put("/access-token", accessTokenHandler);
app.get("/next-user", nextUserHandler);

export default {
  port: 3001,
  fetch: app.fetch,
};
