const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sepsis_demo';

// Basic qSOFA rule logic (screening only)
function calculateQSOFA({ respiratoryRate, systolicBP, mentalStatus }) {
  let score = 0;
  const reasons = [];

  if (respiratoryRate >= 22) {
    score += 1;
    reasons.push('Respiratory rate at or above 22 breaths/min');
  }
  if (systolicBP <= 100) {
    score += 1;
    reasons.push('Systolic blood pressure at or below 100 mmHg');
  }
  if (mentalStatus && mentalStatus.toLowerCase() !== 'alert') {
    score += 1;
    reasons.push('Altered mental status (not fully alert)');
  }

  let riskLabel = 'Low screening score';
  if (score === 1) riskLabel = 'Intermediate screening score';
  if (score >= 2) riskLabel = 'High screening score';

  return { score, riskLabel, reasons };
}

// Mongo Schemas
const patientSchema = new mongoose.Schema(
  {
    externalId: { type: String, required: true, index: true },
    name: String,
    location: String
  },
  { timestamps: true }
);

const readingSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    respiratoryRate: { type: Number, required: true },
    systolicBP: { type: Number, required: true },
    mentalStatus: { type: String, required: true },
    timestamp: { type: Date, required: true },
    qsofaScore: { type: Number, required: true },
    qsofaRiskLabel: { type: String, required: true },
    qsofaReasons: [{ type: String, required: true }]
  },
  { timestamps: true }
);

const Patient = mongoose.model('Patient', patientSchema);
const Reading = mongoose.model('Reading', readingSchema);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Rule-Based Sepsis Screening API running (screening only).' });
});

// List all patients (for database checking)
app.get('/api/patients', async (req, res) => {
  try {
    const patients = await Patient.find().sort({ createdAt: -1 }).lean();
    res.json({ count: patients.length, patients });
  } catch (err) {
    console.error('Error fetching patients', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// List all readings (for database checking)
app.get('/api/readings', async (req, res) => {
  try {
    const readings = await Reading.find()
      .populate('patient', 'externalId name location')
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();
    res.json({ count: readings.length, readings });
  } catch (err) {
    console.error('Error fetching readings', err);
    res.status(500).json({ error: 'Failed to fetch readings' });
  }
});

// Ensure patient helper
async function ensurePatient(externalId, name, location) {
  let patient = await Patient.findOne({ externalId });
  if (!patient) {
    patient = await Patient.create({ externalId, name, location });
  } else if ((name && name !== patient.name) || (location && location !== patient.location)) {
    patient.name = name || patient.name;
    patient.location = location || patient.location;
    await patient.save();
  }
  return patient;
}

// Create reading for a patient
app.post('/api/patients/:externalId/readings', async (req, res) => {
  try {
    const { externalId } = req.params;
    const { name, location, respiratoryRate, systolicBP, mentalStatus, timestamp } = req.body;

    if (
      respiratoryRate === undefined ||
      systolicBP === undefined ||
      !mentalStatus ||
      !timestamp
    ) {
      return res.status(400).json({
        error:
          'Missing required fields. Require respiratoryRate, systolicBP, mentalStatus, timestamp.'
      });
    }

    const patient = await ensurePatient(externalId, name, location);
    const { score, riskLabel, reasons } = calculateQSOFA({
      respiratoryRate,
      systolicBP,
      mentalStatus
    });

    const reading = await Reading.create({
      patient: patient._id,
      respiratoryRate,
      systolicBP,
      mentalStatus,
      timestamp: new Date(timestamp),
      qsofaScore: score,
      qsofaRiskLabel: riskLabel,
      qsofaReasons: reasons
    });

    res.status(201).json({ patientId: patient.externalId, reading });
  } catch (err) {
    console.error('Error creating reading', err);
    res.status(500).json({ error: 'Failed to record reading' });
  }
});

// Fetch readings & derived summary for a patient
app.get('/api/patients/:externalId/summary', async (req, res) => {
  try {
    const { externalId } = req.params;
    const patient = await Patient.findOne({ externalId });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const readings = await Reading.find({ patient: patient._id }).sort({ timestamp: 1 }).lean();

    if (!readings.length) {
      return res.json({
        patient: {
          externalId: patient.externalId,
          name: patient.name,
          location: patient.location
        },
        readings: [],
        alerts: [],
        overall: null
      });
    }

    const alerts = [];
    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1];
      const curr = readings[i];

      // Escalating risk based on qSOFA score
      if (curr.qsofaScore > prev.qsofaScore) {
        alerts.push({
          type: 'Risk escalating',
          level: 'warning',
          timestamp: curr.timestamp,
          explanation: `qSOFA screening score increased from ${prev.qsofaScore} to ${curr.qsofaScore} between readings.`
        });
      }

      // High risk detected
      if (curr.qsofaScore >= 2) {
        alerts.push({
          type: 'High risk screening score',
          level: 'high',
          timestamp: curr.timestamp,
          explanation:
            'qSOFA screening score is at or above 2 based on respiratory rate, blood pressure, and mental status criteria.'
        });
      }

      // Parameter-specific reasoning
      if (curr.respiratoryRate >= 22 && prev.respiratoryRate < 22) {
        alerts.push({
          type: 'Respiratory rate threshold crossed',
          level: 'warning',
          timestamp: curr.timestamp,
          explanation:
            'Respiratory rate increased above the screening threshold of 22 breaths/min compared to the prior reading.'
        });
      }
      if (curr.systolicBP <= 100 && prev.systolicBP > 100) {
        alerts.push({
          type: 'Blood pressure threshold crossed',
          level: 'warning',
          timestamp: curr.timestamp,
          explanation:
            'Systolic blood pressure dropped to or below the screening threshold of 100 mmHg compared to the prior reading.'
        });
      }
      if (
        prev.mentalStatus.toLowerCase() === 'alert' &&
        curr.mentalStatus.toLowerCase() !== 'alert'
      ) {
        alerts.push({
          type: 'Change in mental status',
          level: 'high',
          timestamp: curr.timestamp,
          explanation:
            'Mental status changed from fully alert to an altered state between readings based on recorded input.'
        });
      }
    }

    const latest = readings[readings.length - 1];
    const overall = {
      latestQSOFA: latest.qsofaScore,
      latestRiskLabel: latest.qsofaRiskLabel,
      totalReadings: readings.length
    };

    res.json({
      patient: {
        externalId: patient.externalId,
        name: patient.name,
        location: patient.location
      },
      readings,
      alerts,
      overall
    });
  } catch (err) {
    console.error('Error fetching summary', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Evolving patient scenario (demo only, not real data)
app.get('/api/demo/scenario', (req, res) => {
  const now = Date.now();
  const intervals = [0, 15, 30, 45]; // minutes offset
  const demoReadings = intervals.map((min, idx) => {
    const ts = new Date(now + min * 60 * 1000);
    const respiratoryRate = 18 + idx * 2; // gradually rising
    const systolicBP = 115 - idx * 5; // gradually falling
    const mentalStatus = idx < 3 ? 'Alert' : 'Drowsy';

    const { score, riskLabel, reasons } = calculateQSOFA({
      respiratoryRate,
      systolicBP,
      mentalStatus
    });

    return {
      timestamp: ts,
      respiratoryRate,
      systolicBP,
      mentalStatus,
      qsofaScore: score,
      qsofaRiskLabel: riskLabel,
      qsofaReasons: reasons
    };
  });

  res.json({
    scenarioName: 'Gradual escalation over first hour on the ward',
    readings: demoReadings
  });
});

// Connect to MongoDB and start server
mongoose
  .connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000
  })
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    console.error(
      'The server will not start without a database connection. Please check your MONGO_URI.'
    );
    process.exit(1);
  });

