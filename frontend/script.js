/**
 * PREDICTIVE MAINTENANCE DASHBOARD CONTROLLER
 * Telemetry calculation, Model inference caller, and Audit logger
 */

const API_ENDPOINT = 'https://predictive-maintenance-app-rqps.onrender.com/predict';
const HEALTH_ENDPOINT = 'https://predictive-maintenance-app-rqps.onrender.com/docs';

// Preset configurations for industrial baseline & failure modes
const BENCHMARK_PRESETS = {
  nominal: {
    label: "Kondisi Normal (Baseline)",
    machine_type: "L",
    tool_wear: 105,
    air_temperature: 298.5,
    process_temperature: 309.2,
    rotational_speed: 1450,
    torque: 45.0
  },
  hdf: {
    label: "Uji Overheating (HDF)",
    machine_type: "M",
    tool_wear: 110,
    air_temperature: 304.5,
    process_temperature: 312.0,
    rotational_speed: 1350,
    torque: 62.0
  },
  pwf: {
    label: "Uji Beban Puncak (PWF)",
    machine_type: "L",
    tool_wear: 85,
    air_temperature: 299.0,
    process_temperature: 308.5,
    rotational_speed: 1200,
    torque: 78.0
  },
  twf: {
    label: "Uji Keausan Kritis (TWF)",
    machine_type: "H",
    tool_wear: 235,
    air_temperature: 298.2,
    process_temperature: 308.7,
    rotational_speed: 1550,
    torque: 42.0
  }
};

// DOM Elements
const form = document.getElementById('predictionForm');
const btnSubmit = document.getElementById('btnSubmit');
const btnReset = document.getElementById('btnReset');
const apiBadge = document.getElementById('apiBadge');
const apiStatusText = document.getElementById('apiStatusText');

// Form Input Elements
const inputMachineType = document.getElementById('machine_type');
const inputToolWear = document.getElementById('tool_wear');
const inputAirTemp = document.getElementById('air_temperature');
const inputProcTemp = document.getElementById('process_temperature');
const inputRotSpeed = document.getElementById('rotational_speed');
const inputTorque = document.getElementById('torque');

// Realtime Derived Readouts
const statDeltaT = document.getElementById('statDeltaT');
const statEstPower = document.getElementById('statEstPower');

// Evaluation Container Elements
const statusBox = document.getElementById('statusBox');
const statusPill = document.getElementById('statusPill');
const statusHeadline = document.getElementById('statusHeadline');
const statusDescription = document.getElementById('statusDescription');
const riskPercentVal = document.getElementById('riskPercentVal');
const riskProgressBar = document.getElementById('riskProgressBar');
const latencyReadout = document.getElementById('latencyReadout');
const actionDirectiveText = document.getElementById('actionDirectiveText');
const directiveContainer = document.getElementById('directiveContainer');

// Telemetry Table Cells
const teleAirTemp = document.getElementById('teleAirTemp');
const teleProcTemp = document.getElementById('teleProcTemp');
const teleDeltaT = document.getElementById('teleDeltaT');
const teleRotSpeed = document.getElementById('teleRotSpeed');
const teleTorque = document.getElementById('teleTorque');
const telePower = document.getElementById('telePower');
const teleToolWear = document.getElementById('teleToolWear');
const teleType = document.getElementById('teleType');

// History Table Elements
const historyBody = document.getElementById('historyBody');
const btnClearHistory = document.getElementById('btnClearHistory');
const btnExportHistory = document.getElementById('btnExportHistory');

// Audit log in-memory / storage
let auditHistory = [];
try {
  const saved = localStorage.getItem('pm_audit_history');
  if (saved) auditHistory = JSON.parse(saved);
} catch (e) {
  auditHistory = [];
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkApiHealth();
  updateLiveDerivedMetrics();
  renderHistoryTable();

  // Attach live calculation listeners
  [inputAirTemp, inputProcTemp, inputRotSpeed, inputTorque].forEach(el => {
    el.addEventListener('input', updateLiveDerivedMetrics);
  });

  // Preset button click handlers
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const presetKey = e.currentTarget.getAttribute('data-preset');
      applyPreset(presetKey);
    });
  });

  // Reset handler
  btnReset.addEventListener('click', () => {
    applyPreset('nominal');
    resetEvaluationView();
  });

  // Form submit handler
  form.addEventListener('submit', handleFormSubmit);

  // History controls
  btnClearHistory.addEventListener('click', clearAuditHistory);
  btnExportHistory.addEventListener('click', exportAuditCsv);
});

// Periodic API Health Ping
async function checkApiHealth() {
  try {
    const res = await fetch('http://127.0.0.1:8000/docs', { method: 'HEAD', mode: 'no-cors' });
    apiBadge.classList.remove('error');
    apiStatusText.textContent = 'API: ONLINE (127.0.0.1:8000)';
  } catch (err) {
    apiBadge.classList.add('error');
    apiStatusText.textContent = 'API: OFFLINE';
  }
}

// Live calculation of physics & thermodynamic metrics
function updateLiveDerivedMetrics() {
  const airT = parseFloat(inputAirTemp.value) || 0;
  const procT = parseFloat(inputProcTemp.value) || 0;
  const rpm = parseFloat(inputRotSpeed.value) || 0;
  const torque = parseFloat(inputTorque.value) || 0;

  // Delta T (K)
  const deltaT = (procT - airT).toFixed(2);
  statDeltaT.textContent = `${deltaT} K`;

  // Mechanical Power (Watt) = Torque (Nm) * (RPM * 2 * PI / 60)
  const omega = (rpm * 2 * Math.PI) / 60;
  const powerWatt = Math.round(torque * omega);
  statEstPower.textContent = `${powerWatt.toLocaleString()} W`;
}

// Apply Preset Data
function applyPreset(key) {
  const data = BENCHMARK_PRESETS[key];
  if (!data) return;

  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-preset') === key);
  });

  inputMachineType.value = data.machine_type;
  inputToolWear.value = data.tool_wear;
  inputAirTemp.value = data.air_temperature;
  inputProcTemp.value = data.process_temperature;
  inputRotSpeed.value = data.rotational_speed;
  inputTorque.value = data.torque;

  updateLiveDerivedMetrics();
}

// Form Submission & API Inference
async function handleFormSubmit(e) {
  e.preventDefault();

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<span class="spinner-box"></span> KOMPUTASI INFERENSI...`;

  const payload = {
    machine_type: inputMachineType.value,
    air_temperature: parseFloat(inputAirTemp.value),
    process_temperature: parseFloat(inputProcTemp.value),
    rotational_speed: parseFloat(inputRotSpeed.value),
    torque: parseFloat(inputTorque.value),
    tool_wear: parseFloat(inputToolWear.value)
  };

  const startTime = performance.now();

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const elapsedMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const result = await response.json();
    apiBadge.classList.remove('error');
    apiStatusText.textContent = 'API: ONLINE [127.0.0.1:8000]';

    displayInferenceResults(payload, result, elapsedMs);
    recordAuditEntry(payload, result, elapsedMs);

  } catch (err) {
    console.error('Error contacting backend:', err);
    apiBadge.classList.add('error');
    apiStatusText.textContent = 'API: OFFLINE [ERROR]';

    statusBox.className = 'verdict-box critical';
    statusPill.textContent = 'VERDICT_CODE: 0xFF // CONNECTION_ERROR';
    statusHeadline.textContent = 'GAGAL MENGHUBUNGI SERVER';
    statusDescription.textContent = `Kesalahan transmisi: ${err.message}. Pastikan layanan FastAPI berjalan aktif pada port 8000.`;
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<span>EKSEKUSI INFERENSI MODEL &rarr;</span>`;
  }
}

// Update UI with inference telemetry
function displayInferenceResults(payload, result, elapsedMs) {
  const isFailure = (result.prediction === 1 || result.failure_prediction === 1);
  const prob = (result.failure_probability !== undefined) ? result.failure_probability : 0;
  const pct = (prob * 100).toFixed(2);

  // Status Box Styling
  if (isFailure) {
    statusBox.className = 'verdict-box critical';
    statusPill.textContent = 'VERDICT_CODE: 0x01 // CRITICAL_FAILURE';
    statusHeadline.textContent = 'POTENSI KEGAGALAN TERDETEKSI';
    statusDescription.textContent = 'Model XGBoost mengidentifikasi bahwa kombinasi beban kerja, kecepatan putar spindel, dan parameter termal berada di luar toleransi batas aman komponen.';

    directiveContainer.className = 'operator-directive alert-state';
    actionDirectiveText.textContent = 'Hentikan siklus operasi atau segera turunkan rasio torsi/RPM spindel. Lakukan inspeksi keausan pahat (tool wear) dan verifikasi laju disipasi panas sistem pendingin.';
  } else {
    statusBox.className = 'verdict-box nominal';
    statusPill.textContent = 'VERDICT_CODE: 0x00 // NOMINAL_OPERATION';
    statusHeadline.textContent = 'KONDISI OPERASIONAL NORMAL';
    statusDescription.textContent = 'Seluruh matriks pengukuran sensor berada dalam batas toleransi standar AI4I 2020. Risiko kerusakan komponen berada pada tingkat minimal.';

    directiveContainer.className = 'operator-directive';
    actionDirectiveText.textContent = 'Mesin dapat terus dioperasikan sesuai jadwal manufaktur standar. Lanjutkan pemantauan telemetri periodik.';
  }

  // Risk Score Readout & Progress
  riskPercentVal.textContent = `${pct}%`;
  latencyReadout.textContent = `${elapsedMs} MS`;

  riskProgressBar.style.width = `${Math.min(Math.max(pct, 1), 100)}%`;
  riskProgressBar.className = 'util-bar-fill ' + (isFailure ? 'danger' : (prob > 0.3 ? 'warning' : ''));

  // Telemetry Snapshot Table
  const deltaT = (payload.process_temperature - payload.air_temperature).toFixed(2);
  const powerWatt = Math.round(payload.torque * ((payload.rotational_speed * 2 * Math.PI) / 60));

  teleType.textContent = payload.machine_type;
  teleToolWear.textContent = `${payload.tool_wear} min`;
  teleAirTemp.textContent = `${payload.air_temperature.toFixed(1)} K`;
  teleProcTemp.textContent = `${payload.process_temperature.toFixed(1)} K`;
  teleDeltaT.textContent = `${deltaT} K`;
  teleRotSpeed.textContent = `${payload.rotational_speed} RPM`;
  teleTorque.textContent = `${payload.torque.toFixed(1)} Nm`;
  telePower.textContent = `${powerWatt.toLocaleString()} W`;
}

// Reset evaluation state to initial standby
function resetEvaluationView() {
  statusBox.className = 'verdict-box standby';
  statusPill.textContent = 'VERDICT_CODE: 0x00 // STANDBY';
  statusHeadline.textContent = 'MENUNGGU PARAMETER PENGUJIAN';
  statusDescription.textContent = 'Masukkan nilai pengukuran sensor di panel kiri atau pilih salah satu konfigurasi matriks uji, kemudian klik "EKSEKUSI INFERENSI MODEL".';

  riskPercentVal.textContent = '0.00%';
  riskProgressBar.style.width = '0%';
  riskProgressBar.className = 'util-bar-fill';
  latencyReadout.textContent = '-';

  directiveContainer.className = 'operator-directive';
  actionDirectiveText.textContent = 'Instruksi operasional spesifik akan dipetakan secara otomatis setelah hasil inferensi model selesai dikalkulasi.';
}

// Audit Log Functions
function recordAuditEntry(payload, result, elapsedMs) {
  const isFailure = (result.prediction === 1 || result.failure_prediction === 1);
  const prob = (result.failure_probability !== undefined) ? (result.failure_probability * 100).toFixed(2) : '0.00';

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

  const entry = {
    timestamp: timeStr,
    type: payload.machine_type,
    speed: payload.rotational_speed,
    torque: payload.torque,
    wear: payload.tool_wear,
    risk: `${prob}%`,
    status: isFailure ? 'FAILURE' : 'NORMAL',
    latency: `${elapsedMs}ms`
  };

  auditHistory.unshift(entry);
  if (auditHistory.length > 50) auditHistory.pop();

  try {
    localStorage.setItem('pm_audit_history', JSON.stringify(auditHistory));
  } catch (e) { }

  renderHistoryTable();
}

function renderHistoryTable() {
  if (auditHistory.length === 0) {
    historyBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--zinc-500); padding: 14px;">Belum ada entri log pengujian yang tercatat.</td></tr>`;
    return;
  }

  historyBody.innerHTML = auditHistory.map(item => `
    <tr>
      <td class="numeric">${item.timestamp}</td>
      <td><strong>${item.type}</strong></td>
      <td class="numeric">${item.speed} RPM</td>
      <td class="numeric">${item.torque} Nm</td>
      <td class="numeric">${item.wear} min</td>
      <td class="numeric" style="font-weight: 700; color: ${item.status === 'FAILURE' ? '#DC2626' : '#166534'};">${item.risk}</td>
      <td>
        <span class="tag-status ${item.status === 'FAILURE' ? 'fail' : 'ok'}">${item.status}</span>
      </td>
      <td class="numeric" style="color: var(--zinc-500);">${item.latency}</td>
    </tr>
  `).join('');
}

function clearAuditHistory() {
  if (confirm('Hapus seluruh riwayat pengujian lokal?')) {
    auditHistory = [];
    try {
      localStorage.removeItem('pm_audit_history');
    } catch (e) { }
    renderHistoryTable();
  }
}

function exportAuditCsv() {
  if (auditHistory.length === 0) {
    alert('Tidak ada riwayat pengujian untuk diekspor.');
    return;
  }

  const headers = ['Timestamp', 'Type', 'RotationalSpeed_RPM', 'Torque_Nm', 'ToolWear_min', 'Risk_Percent', 'Status', 'Latency'];
  const rows = auditHistory.map(row => [
    row.timestamp,
    row.type,
    row.speed,
    row.torque,
    row.wear,
    row.risk.replace('%', ''),
    row.status,
    row.latency
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `pm_telemetry_audit_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
