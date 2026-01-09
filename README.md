## Rule-Based Sepsis Screening Software (qSOFA Demo)

**Purpose**: Hackathon-ready, rule-based screening tool that helps non-ICU staff and evaluators see sepsis risk trends using qSOFA criteria.  
**Important**: **This software does not provide medical diagnosis or treatment recommendations.**

### Tech Stack
- **Backend**: Node.js, Express, MongoDB (via Mongoose)
- **Frontend**: HTML, CSS, vanilla JavaScript
- **Charts**: Chart.js (CDN)

### Features
- **Patient Data Input**
  - Capture respiratory rate, systolic blood pressure, mental status, and timestamp.
  - Enter multiple readings over time for the same patient identifier.
- **Rule-Based qSOFA Screening**
  - Transparent rules: RR ≥ 22, SBP ≤ 100, mental status not “Alert”.
  - qSOFA screening score (0–3) with human-readable contributing reasons.
- **Visual Dashboard**
  - Line charts of respiratory rate, systolic BP, and qSOFA screening score over time.
  - Color-coded datasets and tooltips explaining rule contributors.
- **Explainable Alerts**
  - Alerts like “Risk escalating”, “High risk screening score”.
  - Each alert has a timestamp and plain-language reasoning.
- **Patient Scenario Simulation**
  - Built-in evolving patient case showing gradual escalation.
- **Safety & Compliance**
  - Prominent disclaimer section and footer text clarifying screening-only intent.

### Project Structure
- `server.js` – Express server, MongoDB connection, qSOFA rule logic, REST APIs.
- `public/index.html` – Main SPA-style page with navigation and sections.
- `public/styles.css` – Healthcare-style, mobile-responsive UI.
- `public/app.js` – Frontend logic, API calls, Chart.js configuration.
- `package.json` – Node dependencies and scripts.

### API Overview
- `GET /api/health` – Basic health check.
- `POST /api/patients/:externalId/readings`
  - Body: `{ name?, location?, respiratoryRate, systolicBP, mentalStatus, timestamp }`
  - Applies qSOFA rules and stores reading in MongoDB.
- `GET /api/patients/:externalId/summary`
  - Returns patient details, ordered readings, derived alerts, and latest screening summary.
- `GET /api/demo/scenario`
  - Returns a simulated escalating case for the scenario chart.

### Local Setup
1. **Install dependencies**
   ```bash
   cd /Users/atmandash/Desktop/Sepsis
   npm install
   ```

2. **Configure MongoDB URI**
   - Create a `.env` file in the project root:
     ```bash
     touch .env
     ```
   - Add your MongoDB connection string (replace with your real URI):
     ```bash
     MONGO_URI=YOUR_MONGODB_URI_HERE
     PORT=4000
     ```
   - You mentioned you will provide the URI; paste it into `MONGO_URI`.

3. **Run the server**
   ```bash
   npm start
   ```
   or with auto-reload during development:
   ```bash
   npm run dev
   ```

4. **Open the app**
   - Visit `http://localhost:4000` in your browser.

### Using the Demo in a Hackathon
- **Home**: Enter multiple timed readings for a test patient identifier (e.g., `Ward-12-Bed-03`).
- **Dashboard**: Load the same identifier to see:
  - Time-series of vitals and qSOFA screening scores.
  - Rule-based alerts with plain-language explanations.
- **How It Works**: Walk judges through the qSOFA rules and how they’re implemented in software.
- **Disclaimer**: Explicitly highlight that this is a screening-only, non-diagnostic prototype.

### Safety Note
This is a demonstration project. Any real-world clinical deployment would require formal validation, governance, and institutional approval.

