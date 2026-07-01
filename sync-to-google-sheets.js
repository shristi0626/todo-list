const https = require('https');
const http = require('http');

function requestGoogleAppsScript(url, method, payload, taskId) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const body = payload ? JSON.stringify(payload) : undefined;

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(taskId ? { 'x-task-id': taskId } : {}),
      },
    };

    const req = client.request(parsedUrl, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : []);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function main() {
  const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!scriptUrl) {
    console.error('Set GOOGLE_APPS_SCRIPT_URL before running this wrapper.');
    process.exit(1);
  }

  const method = (process.argv[2] || 'GET').toUpperCase();
  const taskId = process.argv[3];
  const payloadRaw = process.argv.slice(4).join(' ');
  const payload = payloadRaw ? JSON.parse(payloadRaw) : undefined;

  try {
    const result = await requestGoogleAppsScript(scriptUrl, method, payload, taskId);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
