const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
const CSV_PATH = path.join(ROOT_DIR, "tasks.csv");
const CSV_HEADERS = ["id", "title", "description", "priority", "completed", "updatedAt"];

function ensureCsvFile() {
  if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(CSV_PATH, `${CSV_HEADERS.join(",")}\n`, "utf8");
  }
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function parseCsv(text) {
  const rows = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map(parseCsvLine);

  if (rows.length === 0) {
    return [];
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

function serializeCsv(tasks) {
  const lines = [CSV_HEADERS.join(",")];
  tasks.forEach((task) => {
    const row = CSV_HEADERS.map((header) => {
      const value = task[header] ?? "";
      if (header === "completed") {
        return value === true || value === "true" ? "true" : "false";
      }
      return escapeCsv(value);
    });
    lines.push(row.join(","));
  });
  return `${lines.join("\n")}\n`;
}

function readTasks() {
  ensureCsvFile();
  const content = fs.readFileSync(CSV_PATH, "utf8");
  return parseCsv(content);
}

function writeTasks(tasks) {
  fs.writeFileSync(CSV_PATH, serializeCsv(tasks), "utf8");
}

function respondJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function normalizeTask(payload, existingTask) {
  const title = String(payload.title || existingTask?.title || "").trim();
  const description = String(payload.description ?? existingTask?.description ?? "");
  const priority = String(payload.priority ?? existingTask?.priority ?? "Medium");
  const completed = payload.completed === true || payload.completed === "true" || payload.completed === 1 || payload.completed === "1";

  return {
    id: existingTask?.id || payload.id || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    description,
    priority,
    completed,
    updatedAt: new Date().toISOString(),
  };
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  }[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

async function requestGoogleSheet(method, path, payload) {
  if (!GOOGLE_APPS_SCRIPT_URL) {
    return null;
  }

  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(path ? { "x-task-path": path } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Google Sheets sync failed with status ${response.status}`);
  }

  const data = await response.json();
  return data;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/tasks") {
    if (req.method === "GET") {
      try {
        const tasks = await requestGoogleSheet("GET", "", undefined);
        respondJson(res, 200, tasks ?? readTasks());
      } catch (error) {
        respondJson(res, 200, readTasks());
      }
      return;
    }

    if (req.method === "POST") {
      try {
        const payload = await readBody(req);
        if (!payload.title || String(payload.title).trim() === "") {
          respondJson(res, 400, { error: "Title is required" });
          return;
        }

        const tasks = await requestGoogleSheet("POST", "", payload);
        if (tasks) {
          respondJson(res, 201, tasks);
          return;
        }

        const localTasks = readTasks();
        const task = normalizeTask(payload);
        localTasks.unshift(task);
        writeTasks(localTasks);
        respondJson(res, 201, localTasks);
      } catch (error) {
        respondJson(res, 400, { error: "Invalid request body" });
      }
      return;
    }
  }

  if (url.pathname.startsWith("/api/tasks/")) {
    const id = url.pathname.split("/").pop();

    if (req.method === "PUT") {
      try {
        const payload = await readBody(req);
        const tasks = await requestGoogleSheet("PUT", id, payload);
        if (tasks) {
          respondJson(res, 200, tasks);
          return;
        }

        const localTasks = readTasks();
        const index = localTasks.findIndex((task) => task.id === id);
        if (index === -1) {
          respondJson(res, 404, { error: "Task not found" });
          return;
        }
        localTasks[index] = normalizeTask(payload, localTasks[index]);
        writeTasks(localTasks);
        respondJson(res, 200, localTasks);
      } catch (error) {
        respondJson(res, 400, { error: "Invalid request body" });
      }
      return;
    }

    if (req.method === "DELETE") {
      try {
        const tasks = await requestGoogleSheet("DELETE", id, {});
        if (tasks) {
          respondJson(res, 200, tasks);
          return;
        }

        const localTasks = readTasks().filter((task) => task.id !== id);
        writeTasks(localTasks);
        respondJson(res, 200, localTasks);
      } catch (error) {
        respondJson(res, 200, readTasks());
      }
      return;
    }
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const fullPath = path.join(ROOT_DIR, requestedPath);

  if (fullPath.startsWith(ROOT_DIR) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    serveFile(res, fullPath);
    return;
  }

  serveFile(res, path.join(ROOT_DIR, "index.html"));
});

server.listen(PORT, () => {
  console.log(`Priority Planner server running at http://localhost:${PORT}`);
  if (!GOOGLE_APPS_SCRIPT_URL) {
    console.log("Set GOOGLE_APPS_SCRIPT_URL to use a Google Sheets-backed spreadsheet.");
  }
});
