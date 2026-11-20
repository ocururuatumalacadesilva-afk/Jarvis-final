// Servidor local do J.A.R.V.I.S. + Fish Audio
// A chave fica no ambiente do servidor. Nunca coloque a chave no HTML.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const FISH_API_KEY = process.env.FISH_API_KEY;
const VOICE_ID = "a5b93aeddcc948c19ea04f0afe9d178c";
const MODEL = "s2.1-pro-free";
const ROOT = __dirname;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/tts") {
    if (!FISH_API_KEY) {
      return send(res, 503, "Servidor ainda sem a chave do Fish Audio. Configure FISH_API_KEY no ambiente.");
    }

    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 20000) {
        req.destroy();
      }
    });

    req.on("end", async () => {
      try {
        const payload = JSON.parse(raw || "{}");
        const text = String(payload.text || "").trim();
        if (!text) return send(res, 400, "Texto vazio.");
        if (text.length > 4000) return send(res, 400, "Texto muito longo.");

        const fishResponse = await fetch("https://api.fish.audio/v1/tts", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${FISH_API_KEY}`,
            "Content-Type": "application/json",
            "model": MODEL
          },
          body: JSON.stringify({
            text,
            reference_id: VOICE_ID,
            format: "mp3"
          })
        });

        if (!fishResponse.ok) {
          const errorText = await fishResponse.text();
          return send(res, fishResponse.status, errorText || "Erro retornado pelo Fish Audio.");
        }

        const audio = Buffer.from(await fishResponse.arrayBuffer());
        res.writeHead(200, {
          "Content-Type": "audio/mpeg",
          "Content-Length": audio.length,
          "Cache-Control": "no-store"
        });
        res.end(audio);
      } catch (error) {
        send(res, 500, "Não foi possível gerar o áudio.");
      }
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Método não permitido.");
  }

  const pathname = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.resolve(ROOT, "." + pathname);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, "index.html")) {
    return send(res, 403, "Acesso negado.");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Arquivo não encontrado.");
    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    if (req.method === "HEAD") return res.end();
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`J.A.R.V.I.S. disponível na porta ${PORT}`);
  console.log(FISH_API_KEY ? "Fish Audio: chave configurada." : "Fish Audio: falta configurar FISH_API_KEY.");
});
