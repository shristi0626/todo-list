# Priority Planner

This app now uses a shared task API. To connect it to Google Sheets, deploy a small Google Apps Script web app and set the `GOOGLE_APPS_SCRIPT_URL` environment variable before starting the server.

## Google Apps Script example

Create a new Apps Script project and paste the following. It supports read, create, update, and delete operations for the same task shape used by the app.

```javascript
const HEADERS = ['id', 'title', 'description', 'priority', 'completed', 'updatedAt'];

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName('Tasks');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Tasks');
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  } else if (sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0].join('') !== HEADERS.join('')) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }

  return sheet;
}

function rowsToObjects(rows) {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map((value) => String(value));
  return dataRows
    .filter((row) => row.some((value) => value !== ''))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });
      return record;
    });
}

function getTasks() {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  return rowsToObjects(values);
}

function writeTasks(tasks) {
  const sheet = getSheet();
  const rows = [HEADERS, ...tasks.map((task) => [
    task.id || Utilities.getUuid(),
    task.title || '',
    task.description || '',
    task.priority || 'Medium',
    task.completed ? 'true' : 'false',
    task.updatedAt || new Date().toISOString(),
  ])];
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  return tasks;
}

function doGet(e) {
  const tasks = getTasks();
  return ContentService.createTextOutput(JSON.stringify(tasks)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const payload = JSON.parse(e.postData.getDataAsString() || '{}');
  const task = {
    id: payload.id || Utilities.getUuid(),
    title: payload.title || '',
    description: payload.description || '',
    priority: payload.priority || 'Medium',
    completed: payload.completed === true || payload.completed === 'true',
    updatedAt: new Date().toISOString(),
  };
  const currentTasks = getTasks();
  currentTasks.unshift(task);
  const savedTasks = writeTasks(currentTasks);
  return ContentService.createTextOutput(JSON.stringify(savedTasks)).setMimeType(ContentService.MimeType.JSON);
}

function doPut(e) {
  const payload = JSON.parse(e.postData.getDataAsString() || '{}');
  const taskId = e.parameter.id || payload.id;
  const currentTasks = getTasks();
  const index = currentTasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Task not found' })).setMimeType(ContentService.MimeType.JSON);
  }

  const updatedTask = {
    ...currentTasks[index],
    ...payload,
    id: taskId,
    completed: payload.completed === true || payload.completed === 'true',
    updatedAt: new Date().toISOString(),
  };

  currentTasks[index] = updatedTask;
  const savedTasks = writeTasks(currentTasks);
  return ContentService.createTextOutput(JSON.stringify(savedTasks)).setMimeType(ContentService.MimeType.JSON);
}

function doDelete(e) {
  const taskId = e.parameter.id;
  const currentTasks = getTasks();
  const filteredTasks = currentTasks.filter((task) => task.id !== taskId);
  const savedTasks = writeTasks(filteredTasks);
  return ContentService.createTextOutput(JSON.stringify(savedTasks)).setMimeType(ContentService.MimeType.JSON);
}

function doGetRequest(e) {
  const path = e.parameter.path || '';
  const method = e.parameter.method || 'GET';
  if (method === 'POST') {
    return doPost(e);
  }
  if (method === 'PUT') {
    return doPut(e);
  }
  if (method === 'DELETE') {
    return doDelete(e);
  }
  return doGet(e);
}
```

Then deploy as a web app and set:

```bash
GOOGLE_APPS_SCRIPT_URL="https://script.google.com/macros/s/dev/..."
```
