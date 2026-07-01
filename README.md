# Priority Planner

This app uses a shared task API backed by a CSV file so multiple people can access the same task list from a common backend file.

## How to use it

1. Start the local server:
   ```bash
   node server.js
   ```
2. If you want multiple machines to share the same task file, point the server at a shared location:
   ```bash
   $env:TASKS_FILE_PATH = "C:\\shared\\tasks.csv"
   node server.js
   ```
3. Open the app in your browser:
   ```text
   http://localhost:3000
   ```
4. Add, edit, complete, or delete tasks. The changes are written to the shared backend file configured by TASKS_FILE_PATH.

## Shared data file

The app writes tasks to the file configured by TASKS_FILE_PATH. By default it uses [todo-list/tasks.csv](tasks.csv), but you can point it to a shared network location so multiple users can add and see the same tasks.
