const $ = (selector) => document.querySelector(selector);
const state = { readings: [], summary: null, settings: null, deleteId: null, noticeTimer: null };
const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function formatNumber(value) { return value === null || value === undefined ? '—' : numberFormat.format(Number(value)); }
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  } catch (_) {
    throw new Error('Cannot reach the server. Check that npm start is running and try again.');
  }
  let payload;
  try { payload = await response.json(); } catch (_) { throw new Error('The server returned an unreadable response.'); }
  if (!response.ok || !payload.success) {
    const error = new Error(payload.error || 'The request failed.');
    error.details = payload.details || {};
    error.status = response.status;
    throw error;
  }
  return payload.data;
}
function showNotice(message, type = 'success') {
  const notice = $('#notice');
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
  window.clearTimeout(state.noticeTimer);
  state.noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 5000);
}
function showError(error) { showNotice(error.message || 'Something went wrong.', 'error'); }
function usageRows(readings) {
  const sorted = [...readings].sort((a, b) => a.reading_date.localeCompare(b.reading_date));
  return sorted.map((row, index) => ({ ...row, usage_m3: index === 0 ? null : Number((Number(row.meter_reading_m3) - Number(sorted[index - 1].meter_reading_m3)).toFixed(3)) }));
}
function tableMarkup(readings, compact = false) {
  const rows = usageRows(readings).sort((a, b) => b.reading_date.localeCompare(a.reading_date));
  if (!rows.length) return `<div class="empty-state"><span>▤</span><strong>No readings yet</strong><p>Record your first meter value to start tracking water use.</p><button class="button button-primary" data-action="add" type="button">＋ Add first reading</button></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Meter reading</th><th>Interval usage</th><th>Category</th>${compact ? '' : '<th>Notes</th>'}<th>Actions</th></tr></thead><tbody>${rows.map(row => `<tr><td class="date-cell">${escapeHtml(formatDate(row.reading_date))}</td><td class="meter-cell">${formatNumber(row.meter_reading_m3)} m³</td><td>${row.usage_m3 === null ? '<span class="category-pill">First entry</span>' : `<span class="usage-pill">${formatNumber(row.usage_m3)} m³</span>`}</td><td><span class="category-pill">${escapeHtml(row.category)}</span></td>${compact ? '' : `<td>${escapeHtml(row.notes || '—')}</td>`}<td><div class="table-actions"><button class="small-action" data-action="edit" data-id="${row.id}" type="button" aria-label="Edit reading ${escapeHtml(row.reading_date)}">Edit</button><button class="small-action delete" data-action="delete" data-id="${row.id}" type="button" aria-label="Delete reading ${escapeHtml(row.reading_date)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
function renderChart(readings) {
  const target = $('#usage-chart');
  const rows = usageRows(readings).filter(row => row.usage_m3 !== null).slice(-7);
  if (!rows.length) {
    target.innerHTML = '<div class="empty-state compact"><span>▥</span><strong>Your trend will appear here</strong><p>Add at least two readings to see usage.</p></div>';
    return;
  }
  const width = 600, height = 220, left = 42, right = 18, top = 16, bottom = 38;
  const max = Math.max(...rows.map(row => row.usage_m3), 0.001) * 1.2;
  const x = i => left + (rows.length === 1 ? (width-left-right)/2 : i*(width-left-right)/(rows.length-1));
  const y = value => height-bottom-(value/max)*(height-top-bottom);
  const points = rows.map((row, i) => `${x(i)},${y(row.usage_m3)}`).join(' ');
  const area = `${x(0)},${height-bottom} ${points} ${x(rows.length-1)},${height-bottom}`;
  const grid = [0, .33, .66, 1].map(r => { const yy = y(max*r); return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="#eaf0f0" stroke-dasharray="4 5"/><text x="${left-9}" y="${yy+4}" text-anchor="end" fill="#9ba8ac" font-size="10">${formatNumber(max*r)}</text>`; }).join('');
  const circles = rows.map((row,i) => `<circle cx="${x(i)}" cy="${y(row.usage_m3)}" r="4.5" fill="#fff" stroke="#0a9a8c" stroke-width="2.5"><title>${escapeHtml(formatDate(row.reading_date))}: ${formatNumber(row.usage_m3)} m³</title></circle><text x="${x(i)}" y="${height-13}" text-anchor="middle" fill="#8b9a9f" font-size="10">${escapeHtml(new Date(`${row.reading_date}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}))}</text>`).join('');
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Line chart of recent water usage in cubic metres">${grid}<polygon points="${area}" fill="#0a9a8c" opacity=".09"/><polyline points="${points}" fill="none" stroke="#0a9a8c" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${circles}</svg>`;
}
function renderDashboard() {
  const summary = state.summary;
  $('#stat-meter').innerHTML = summary.latestMeterReading === null ? '—' : `${formatNumber(summary.latestMeterReading)} <small>m³</small>`;
  $('#stat-meter-foot').textContent = summary.latestDate ? `Last entered ${formatDate(summary.latestDate)}` : 'Add your first reading';
  $('#stat-latest-usage').innerHTML = summary.latestUsage === null ? '—' : `${formatNumber(summary.latestUsage)} <small>m³</small>`;
  $('#stat-usage-foot').textContent = summary.changePercent === null ? 'Needs more readings to compare' : `${summary.changePercent > 0 ? '↑' : summary.changePercent < 0 ? '↓' : '→'} ${Math.abs(summary.changePercent)}% vs previous interval`;
  $('#stat-average').innerHTML = summary.averagePerInterval ? `${formatNumber(summary.averagePerInterval)} <small>m³</small>` : '—';
  $('#stat-target').innerHTML = `${formatNumber(summary.dailyTarget)} <small>m³</small>`;
  $('#goal-number').innerHTML = `${formatNumber(summary.dailyTarget)} <span>m³ / day</span>`;
  const latest = summary.latestUsage;
  const target = summary.dailyTarget;
  const ratio = latest === null ? 0 : Math.min(100, (latest / target) * 100);
  $('#goal-progress').style.width = `${ratio}%`;
  $('#goal-copy').textContent = latest === null ? 'Add at least two readings to compare usage with your target.' : latest <= target ? 'Latest interval usage is within your target amount. Check the interval length before comparing to a daily goal.' : 'Latest interval usage is above your target amount. Check how many days the interval covers.';
  renderChart(state.readings);
  $('#recent-table-container').innerHTML = tableMarkup(state.readings.slice().sort((a,b)=>b.reading_date.localeCompare(a.reading_date)).slice(0,5), true);
}
function renderAllReadings() {
  const from = $('#filter-from').value;
  const to = $('#filter-to').value;
  const category = $('#filter-category').value;
  const search = $('#filter-search').value.trim().toLowerCase();
  const filtered = state.readings.filter(row => (!from || row.reading_date >= from) && (!to || row.reading_date <= to) && (category === 'All' || row.category === category) && (!search || (row.notes || '').toLowerCase().includes(search)));
  $('#all-table-container').innerHTML = tableMarkup(filtered, false);
}
async function refreshData() {
  $('#recent-table-container').innerHTML = '<div class="loading-state">Loading readings…</div>';
  try {
    const [readings, summary, settings] = await Promise.all([api('/api/readings'), api('/api/summary'), api('/api/settings')]);
    state.readings = readings;
    state.summary = summary;
    state.settings = settings;
    renderDashboard();
    renderAllReadings();
    $('#daily-target').value = Number(settings.daily_target_m3).toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
  } catch (error) {
    $('#recent-table-container').innerHTML = '<div class="empty-state"><strong>Could not load your data</strong><p>Check the server and Supabase settings, then reload.</p></div>';
    $('#all-table-container').innerHTML = '<div class="empty-state"><strong>Could not load readings</strong><p>Check the server and Supabase settings, then reload.</p></div>';
    showError(error);
  }
}
function navigate(view) {
  const valid = ['dashboard', 'readings', 'settings'].includes(view) ? view : 'dashboard';
  document.querySelectorAll('.view').forEach(section => { section.hidden = section.id !== `${valid}-view`; });
  document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.view === valid));
  $('#page-title').textContent = ({ dashboard: 'Your water overview', readings: 'Meter reading log', settings: 'Goals & settings' })[valid];
  if (valid === 'readings') renderAllReadings();
}
function openReadingDialog(reading = null) {
  const dialog = $('#reading-dialog');
  $('#reading-form').reset();
  $('#form-error').hidden = true;
  $('#reading-id').value = reading ? reading.id : '';
  $('#dialog-title').textContent = reading ? 'Edit meter reading' : 'Add a reading';
  $('#save-reading').textContent = reading ? 'Save changes' : 'Save reading';
  $('#reading-date').value = reading ? reading.reading_date : new Date().toISOString().slice(0,10);
  $('#meter-reading').value = reading ? reading.meter_reading_m3 : '';
  $('#reading-category').value = reading ? reading.category : 'Household';
  $('#reading-notes').value = reading ? (reading.notes || '') : '';
  if (!dialog.open) dialog.showModal();
  $('#reading-date').focus();
}
function closeReadingDialog() { if ($('#reading-dialog').open) $('#reading-dialog').close(); }
function displayFormError(error) {
  const messages = Object.values(error.details || {});
  $('#form-error').textContent = messages.length ? `${error.message} ${messages.join(' ')}` : error.message;
  $('#form-error').hidden = false;
}
async function saveReading(event) {
  event.preventDefault();
  const id = $('#reading-id').value;
  const body = { reading_date: $('#reading-date').value, meter_reading_m3: $('#meter-reading').value, category: $('#reading-category').value, notes: $('#reading-notes').value.trim() };
  const button = $('#save-reading');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    await api(id ? `/api/readings/${encodeURIComponent(id)}` : '/api/readings', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    closeReadingDialog();
    await refreshData();
    showNotice(id ? 'Reading updated successfully.' : 'Meter reading saved successfully.');
  } catch (error) { displayFormError(error); }
  finally { button.disabled = false; button.textContent = id ? 'Save changes' : 'Save reading'; }
}
function askDelete(id) { state.deleteId = id; $('#confirm-overlay').hidden = false; $('#confirm-cancel').focus(); }
function cancelDelete() { state.deleteId = null; $('#confirm-overlay').hidden = true; }
async function deleteReading() {
  if (!state.deleteId) return;
  const button = $('#confirm-delete');
  button.disabled = true;
  try {
    await api(`/api/readings/${encodeURIComponent(state.deleteId)}`, { method: 'DELETE' });
    cancelDelete();
    await refreshData();
    showNotice('Reading deleted. Usage calculations have been refreshed.');
  } catch (error) { cancelDelete(); showError(error); }
  finally { button.disabled = false; }
}
async function saveSettings(event) {
  event.preventDefault();
  const button = event.submitter || $('#settings-form button[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ daily_target_m3: $('#daily-target').value }) });
    await refreshData();
    showNotice('Conservation target saved.');
  } catch (error) { showError(error); }
  finally { button.disabled = false; }
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-view]');
  if (nav) { event.preventDefault(); const view = nav.dataset.view; history.replaceState(null, '', `#${view}`); navigate(view); return; }
  const add = event.target.closest('[data-action="add"],#top-add-button,#banner-add-button,#readings-add-button');
  if (add) { openReadingDialog(); return; }
  const action = event.target.closest('[data-action]');
  if (action?.dataset.action === 'edit') { const reading = state.readings.find(row => String(row.id) === action.dataset.id); if (reading) openReadingDialog(reading); }
  if (action?.dataset.action === 'delete') askDelete(Number(action.dataset.id));
});
$('#reading-form').addEventListener('submit', saveReading);
$('#settings-form').addEventListener('submit', saveSettings);
$('#dialog-close').addEventListener('click', closeReadingDialog);
$('#cancel-dialog').addEventListener('click', closeReadingDialog);
$('#confirm-cancel').addEventListener('click', cancelDelete);
$('#confirm-delete').addEventListener('click', deleteReading);
['filter-from','filter-to','filter-category'].forEach(id => $(`#${id}`).addEventListener('change', renderAllReadings));
$('#filter-search').addEventListener('input', renderAllReadings);
$('#clear-filters').addEventListener('click', () => { $('#filter-from').value = ''; $('#filter-to').value = ''; $('#filter-category').value = 'All'; $('#filter-search').value = ''; renderAllReadings(); });
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
$('#today-label').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
navigate(location.hash.slice(1));
refreshData();
