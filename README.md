# Reviora Workflow Studio

Visual AI Workflow Editor — drag-and-drop node-based interface for generating images and videos using AI models.

## Tech Stack
- **Frontend**: React + ReactFlow + Vite
- **Backend**: Flask (Python)
- **Database**: PythonAnywhere DB API (shared with Telegram bot)
- **AI APIs**: Leonardo AI, Freepik Kling 2.6

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
cp ../.env_example .env  # Edit with your keys
python app.py
```

### Frontend (Development)
```bash
cd frontend
npm install
npm run dev
```

### Frontend (Production Build)
```bash
cd frontend
npm run build
# Built files served by Flask from frontend/dist/
```

## Environment Variables
See `.env_example` for all required configuration.

## Deploy to Railway
1. Set root directory to `workflow_studio/`
2. Add environment variables from `.env_example`
3. Railway will use `Procfile` automatically
