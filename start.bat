@echo off
start "Backend" cmd /k "chatdev-venv\Scripts\activate && python server_main.py --port 6400"
cd frontend
set VITE_API_BASE_URL=http://localhost:6400
npm run dev