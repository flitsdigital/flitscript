import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { defineConfig, loadEnv, type Plugin } from "vite";

// Serves api/<name>.ts locally with the same Web Request/Response signature Vercel uses.
function devApi(): Plugin {
  return {
    name: "dev-api",
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ""));
      server.middlewares.use("/api", async (req, res, next) => {
        const name = new URL(req.url ?? "/", "http://localhost").pathname.slice(1);
        if (!/^[a-z-]+$/.test(name)) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const handler = mod[req.method ?? "GET"];
          if (typeof handler !== "function") {
            res.statusCode = 405;
            return res.end();
          }
          const hasBody = req.method !== "GET" && req.method !== "HEAD";
          const request = new Request(`http://localhost${req.originalUrl}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
            duplex: "half",
          } as RequestInit);
          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), devApi()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
