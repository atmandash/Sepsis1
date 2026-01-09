// Simple single-page navigation
document.querySelectorAll('.nav-link').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const targetId = btn.getAttribute('data-target');
    document.querySelectorAll('.page-section').forEach((section) => {
      section.classList.toggle('visible', section.id === targetId);
    });
  });
});

const apiBase = ''; // same origin

// Utility: format timestamp for display
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

// --- Input form handling ---
const readingForm = document.getElementById('reading-form');
const formStatus = document.getElementById('form-status');

const summaryEmpty = document.getElementById('summary-empty');
const summaryContent = document.getElementById('summary-content');
const summaryPatientId = document.getElementById('summary-patientId');
const summaryQsofa = document.getElementById('summary-qsofa');
const summaryRiskLabel = document.getElementById('summary-riskLabel');
const summaryCount = document.getElementById('summary-count');
const summaryReasons = document.getElementById('summary-reasons');

async function refreshSummary(patientId) {
  if (!patientId) return;
  try {
    const res = await fetch(`${apiBase}/api/patients/${encodeURIComponent(patientId)}/summary`);
    if (!res.ok) {
      summaryEmpty.textContent = 'No stored readings yet for this patient identifier.';
      summaryContent.classList.add('hidden');
      summaryEmpty.classList.remove('hidden');
      return;
    }
    const data = await res.json();
    if (!data.overall) {
      summaryEmpty.textContent = 'No stored readings yet for this patient identifier.';
      summaryContent.classList.add('hidden');
      summaryEmpty.classList.remove('hidden');
      return;
    }

    summaryPatientId.textContent = data.patient.externalId;
    summaryQsofa.textContent = data.overall.latestQSOFA;
    summaryRiskLabel.textContent = data.overall.latestRiskLabel;
    summaryCount.textContent = data.overall.totalReadings;

    summaryReasons.innerHTML = '';
    const last = data.readings[data.readings.length - 1];
    (last.qsofaReasons || []).forEach((reason) => {
      const li = document.createElement('li');
      li.textContent = reason;
      summaryReasons.appendChild(li);
    });

    summaryEmpty.classList.add('hidden');
    summaryContent.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    summaryEmpty.textContent = 'Unable to load summary. Please check connection to the server.';
    summaryContent.classList.add('hidden');
    summaryEmpty.classList.remove('hidden');
  }
}

readingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formStatus.textContent = '';
  formStatus.classList.remove('error', 'success');

  const patientId = document.getElementById('patientId').value.trim();
  const patientName = document.getElementById('patientName').value.trim();
  const patientLocation = document.getElementById('patientLocation').value.trim();
  const respiratoryRate = Number(document.getElementById('respiratoryRate').value);
  const systolicBP = Number(document.getElementById('systolicBP').value);
  const mentalStatus = document.getElementById('mentalStatus').value;
  const timestamp = document.getElementById('timestamp').value;

  if (!patientId || !mentalStatus || !timestamp) {
    formStatus.textContent = 'Please fill in all required fields.';
    formStatus.classList.add('error');
    return;
  }

  try {
    formStatus.textContent = 'Saving...';
    const res = await fetch(`${apiBase}/api/patients/${encodeURIComponent(patientId)}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: patientName || undefined,
        location: patientLocation || undefined,
        respiratoryRate,
        systolicBP,
        mentalStatus,
        timestamp
      })
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      formStatus.textContent = error.error || 'Unable to save reading.';
      formStatus.classList.add('error');
      return;
    }

    formStatus.textContent = 'Reading recorded for screening.';
    formStatus.classList.add('success');

    // Keep patient id in dashboard input for quick access
    document.getElementById('dashboard-patientId').value = patientId;

    // Refresh summary & dashboard
    refreshSummary(patientId);
    loadDashboard(patientId);
  } catch (err) {
    console.error(err);
    formStatus.textContent = 'Network error while saving reading.';
    formStatus.classList.add('error');
  }
});

// --- Dashboard charts & alerts ---
let vitalsChart = null;
let scenarioChart = null;

const dashboardStatus = document.getElementById('dashboard-status');
const alertsList = document.getElementById('alerts-list');

function buildVitalsChart(readings) {
  const ctx = document.getElementById('vitals-chart').getContext('2d');

  const labels = readings.map((r) => formatTime(r.timestamp));
  const rr = readings.map((r) => r.respiratoryRate);
  const sbp = readings.map((r) => r.systolicBP);
  const qsofa = readings.map((r) => r.qsofaScore);

  if (vitalsChart) {
    vitalsChart.destroy();
  }

  vitalsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Respiratory rate',
          data: rr,
          borderColor: '#1769ff',
          backgroundColor: 'rgba(23,105,255,0.1)',
          tension: 0.3,
          fill: false,
          yAxisID: 'y'
        },
        {
          label: 'Systolic BP',
          data: sbp,
          borderColor: '#2e7d32',
          backgroundColor: 'rgba(46,125,50,0.1)',
          tension: 0.3,
          fill: false,
          yAxisID: 'y1'
        },
        {
          label: 'qSOFA screening score',
          data: qsofa,
          borderColor: '#e53935',
          backgroundColor: 'rgba(229,57,53,0.15)',
          tension: 0.2,
          stepped: true,
          fill: true,
          yAxisID: 'y2'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const idx = items[0].dataIndex;
              const r = readings[idx];
              return r.qsofaReasons && r.qsofaReasons.length
                ? ['qSOFA contributors:', ...r.qsofaReasons]
                : [];
            }
          }
        }
      },
      scales: {
        y: {
          position: 'left',
          title: { display: true, text: 'Respiratory rate' }
        },
        y1: {
          position: 'right',
          title: { display: true, text: 'Systolic BP' },
          grid: { drawOnChartArea: false }
        },
        y2: {
          position: 'right',
          title: { display: true, text: 'qSOFA score' },
          grid: { drawOnChartArea: false },
          min: 0,
          max: 3,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}

function renderAlerts(alerts) {
  alertsList.innerHTML = '';
  if (!alerts.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No rule-based screening alerts yet for this patient.';
    empty.className = 'helper-text';
    alertsList.appendChild(empty);
    return;
  }

  alerts.forEach((alert) => {
    const item = document.createElement('div');
    item.className = 'alert-item';

    const header = document.createElement('div');
    header.className = 'alert-header';

    const title = document.createElement('span');
    title.textContent = alert.type;

    const tag = document.createElement('span');
    tag.className = `alert-tag ${alert.level}`;
    tag.textContent = alert.level === 'high' ? 'High' : 'Warning';

    header.appendChild(title);
    header.appendChild(tag);

    const timestamp = document.createElement('div');
    timestamp.className = 'alert-timestamp';
    timestamp.textContent = formatTime(alert.timestamp);

    const body = document.createElement('div');
    body.className = 'alert-body';
    body.textContent = alert.explanation;

    item.appendChild(header);
    item.appendChild(timestamp);
    item.appendChild(body);

    alertsList.appendChild(item);
  });
}

async function loadDashboard(patientIdFromCaller) {
  const patientId =
    patientIdFromCaller || document.getElementById('dashboard-patientId').value.trim();
  if (!patientId) {
    dashboardStatus.textContent = 'Enter a patient identifier to load trends.';
    dashboardStatus.classList.remove('success');
    return;
  }

  dashboardStatus.textContent = 'Loading trends...';
  dashboardStatus.classList.remove('error');

  try {
    const res = await fetch(`${apiBase}/api/patients/${encodeURIComponent(patientId)}/summary`);
    if (!res.ok) {
      dashboardStatus.textContent = 'No data found for this identifier.';
      dashboardStatus.classList.add('error');
      buildVitalsChart([]);
      renderAlerts([]);
      return;
    }
    const data = await res.json();
    if (!data.readings.length) {
      dashboardStatus.textContent = 'No readings yet for this identifier.';
      dashboardStatus.classList.add('error');
      buildVitalsChart([]);
      renderAlerts([]);
      return;
    }

    buildVitalsChart(data.readings);
    renderAlerts(data.alerts || []);
    dashboardStatus.textContent = 'Trends loaded.';
    dashboardStatus.classList.remove('error');
    dashboardStatus.classList.add('success');
  } catch (err) {
    console.error(err);
    dashboardStatus.textContent = 'Unable to reach the server for dashboard data.';
    dashboardStatus.classList.add('error');
  }
}

document.getElementById('load-dashboard').addEventListener('click', () => loadDashboard());

// --- Scenario simulation ---
const scenarioDetails = document.getElementById('scenario-details');

function buildScenarioChart(readings) {
  const ctx = document.getElementById('scenario-chart').getContext('2d');
  const labels = readings.map((r, idx) => `T+${idx * 15} min`);
  const rr = readings.map((r) => r.respiratoryRate);
  const sbp = readings.map((r) => r.systolicBP);
  const qsofa = readings.map((r) => r.qsofaScore);

  if (scenarioChart) {
    scenarioChart.destroy();
  }

  scenarioChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Respiratory rate',
          data: rr,
          borderColor: '#1769ff',
          tension: 0.3,
          fill: false
        },
        {
          label: 'Systolic BP',
          data: sbp,
          borderColor: '#2e7d32',
          tension: 0.3,
          fill: false
        },
        {
          label: 'qSOFA score',
          data: qsofa,
          borderColor: '#e53935',
          backgroundColor: 'rgba(229,57,53,0.15)',
          tension: 0.2,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          min: 0
        }
      }
    }
  });
}

async function runScenario() {
  scenarioDetails.textContent = 'Loading demo scenario...';
  try {
    const res = await fetch(`${apiBase}/api/demo/scenario`);
    const data = await res.json();
    buildScenarioChart(data.readings);

    const final = data.readings[data.readings.length - 1];
    scenarioDetails.innerHTML = `
      <strong>${data.scenarioName}</strong><br/>
      Final qSOFA screening score: <strong>${final.qsofaScore}</strong> (${final.qsofaRiskLabel}).<br/>
      Key contributors: ${final.qsofaReasons.join('; ')}.
    `;
  } catch (err) {
    console.error(err);
    scenarioDetails.textContent = 'Unable to load scenario from server.';
  }
}

document.getElementById('run-scenario').addEventListener('click', runScenario);

