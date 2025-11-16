import { createServer } from "../../server/main.ts";
import { routes } from "./app/routes.ts";

export const start = () =>
  createServer(routes, {
    basePath: "",
    staticDir: "./examples/showcase/public",
    staticPrefix: "/static",
  });

export const startShowcase = start;

if (import.meta.main) {
  start();
}
