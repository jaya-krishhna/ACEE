# Event Platform

Monorepo for the Event Platform application.

## Directory Structure

- `/backend` - Express + TypeScript backend API
- `/frontend` - Next.js frontend application (to be scaffolded in a later phase)

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- Docker & Docker Compose

## Getting Started

### 1. Database Setup

To start the database, run the following command from the root directory:

```bash
docker compose up -d
```

This starts a PostgreSQL instance with `pgvector` enabled:

- **Port:** `5432`
- **Database:** `eventdb`
- **User:** `postgres`
- **Password:** `postgrespassword`
- **Volume:** `event-platform-pgdata` (named, persistent)

To stop the database:

```bash
docker compose down
```

### 2. Backend Setup

Navigate to the `backend` directory, install dependencies, and run the development server:

```bash
cd backend
npm install
npm run dev
```

The backend server runs on `http://localhost:4000` (by default) with live-reloading.

> **Note on TLS / Network Security:** All backend npm scripts set `NODE_OPTIONS=--use-system-ca`. This instructs Node.js to trust operating system root certificate stores in addition to Node's built-in certificates. This prevents `fetch failed` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE` errors when calling external services like the Gemini API on networks with TLS inspection or managed security/antivirus software.


### 3. API Documentation (Swagger UI)

When the backend server is running, the interactive Swagger API documentation is available at:

`http://localhost:4000/api-docs`

Use this interface to test API endpoints (e.g., `GET /health`) interactively.

### 4. Linting and Formatting

Run linting and formatting for the entire project from the root:

```bash
npm install   # Install root linting tools
npm run lint  # Run ESLint
npm run format # Run Prettier formatter
```
