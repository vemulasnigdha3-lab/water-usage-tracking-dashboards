const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createSupabaseClient } = require('./supabase');
const { validateReading, validateSettings, VALID_CATEGORIES } = require('./validation');

dotenv.config({ path: path.join(__dirname, '.env') });
const app = express();
const PORT = Number(process.env.PORT) || 3000;
let supabase;

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], upgradeInsecureRequests: null } } }));
app.use(express.json({ limit: '20kb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

function sendError(res, status, message, details) {
  const payload = { success: false, error: message };
  if (details) payload.details = details;
  return res.status(status).json(payload);
}
function dbError(res, error, action) {
  console.error(`[database:${action}]`, error?.message || 'Unknown database error');
  return sendError(res, 500, 'Database operation failed. Check the schema and Supabase configuration.');
}
function requireDb(req, res, next) {
  if (!supabase) return sendError(res, 503, 'Database is not configured. Fill in backend/.env and restart the server.');
  next();
}

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok', databaseConfigured: Boolean(supabase) }));
app.get('/api/categories', (req, res) => res.json({ success: true, data: VALID_CATEGORIES }));

app.get('/api/readings', requireDb, async (req, res) => {
  const { from, to, category, search } = req.query;
  if (from && (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(Date.parse(from)))) return sendError(res, 400, 'Invalid from date. Use YYYY-MM-DD.');
  if (to && (!/^\d{4}-\d{2}-\d{2}$/.test(to) || Number.isNaN(Date.parse(to)))) return sendError(res, 400, 'Invalid to date. Use YYYY-MM-DD.');
  if (from && to && from > to) return sendError(res, 400, 'The from date must be on or before the to date.');
  let query = supabase.from('water_readings').select('*').order('reading_date', { ascending: false }).order('created_at', { ascending: false });
  if (from) query = query.gte('reading_date', from);
  if (to) query = query.lte('reading_date', to);
  if (category && category !== 'All' && !VALID_CATEGORIES.includes(category)) return sendError(res, 400, 'Invalid category.');
  if (category && category !== 'All') query = query.eq('category', category);
  if (search) query = query.ilike('notes', `%${String(search).replace(/[%_,]/g, ' ')}%`);
  const { data, error } = await query;
  if (error) return dbError(res, error, 'list readings');
  res.json({ success: true, data });
});

app.post('/api/readings', requireDb, async (req, res) => {
  const { errors, value } = validateReading(req.body || {});
  if (Object.keys(errors).length) return sendError(res, 400, 'Please correct the highlighted fields.', errors);
  const { data: previous, error: previousError } = await supabase.from('water_readings').select('reading_date,meter_reading_m3').lt('reading_date', value.reading_date).order('reading_date', { ascending: false }).limit(1);
  if (previousError) return dbError(res, previousError, 'check previous reading');
  const { data: sameDay, error: sameDayError } = await supabase.from('water_readings').select('id').eq('reading_date', value.reading_date).limit(1);
  if (sameDayError) return dbError(res, sameDayError, 'check duplicate date');
  if (sameDay?.length) return sendError(res, 409, 'A reading already exists for this date. Edit it instead of adding a duplicate.', { reading_date: 'Only one meter reading per date is allowed.' });
  if (previous?.length && value.meter_reading_m3 < Number(previous[0].meter_reading_m3)) return sendError(res, 400, 'Meter reading cannot be lower than the previous dated reading.', { meter_reading_m3: 'Check the meter value or correct the earlier reading.' });
  const { data, error } = await supabase.from('water_readings').insert(value).select('*').single();
  if (error) {
    if (error.code === '23505') return sendError(res, 409, 'A reading already exists for this date.');
    return dbError(res, error, 'create reading');
  }
  res.status(201).json({ success: true, data });
});

app.put('/api/readings/:id', requireDb, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return sendError(res, 400, 'Invalid reading ID.');
  const { errors, value } = validateReading(req.body || {});
  if (Object.keys(errors).length) return sendError(res, 400, 'Please correct the highlighted fields.', errors);
  const { data: existing, error: existingError } = await supabase.from('water_readings').select('id').eq('id', id).maybeSingle();
  if (existingError) return dbError(res, existingError, 'find reading');
  if (!existing) return sendError(res, 404, 'Reading not found.');
  const { data: duplicate, error: duplicateError } = await supabase.from('water_readings').select('id').eq('reading_date', value.reading_date).neq('id', id).limit(1);
  if (duplicateError) return dbError(res, duplicateError, 'check duplicate date');
  if (duplicate?.length) return sendError(res, 409, 'Another reading already uses this date.', { reading_date: 'Choose a different date.' });
  const { data: all, error: allError } = await supabase.from('water_readings').select('id,reading_date,meter_reading_m3').neq('id', id).order('reading_date', { ascending: true });
  if (allError) return dbError(res, allError, 'validate reading sequence');
  const ordered = [...all, { id, ...value }].sort((a, b) => a.reading_date.localeCompare(b.reading_date));
  for (let i = 1; i < ordered.length; i++) {
    if (Number(ordered[i].meter_reading_m3) < Number(ordered[i - 1].meter_reading_m3)) return sendError(res, 400, 'Meter readings must never decrease as dates move forward.', { meter_reading_m3: `This value must be at least ${ordered[i - 1].meter_reading_m3} m³ for the reading sequence.` });
  }
  const { data, error } = await supabase.from('water_readings').update(value).eq('id', id).select('*').single();
  if (error) return dbError(res, error, 'update reading');
  res.json({ success: true, data });
});

app.delete('/api/readings/:id', requireDb, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return sendError(res, 400, 'Invalid reading ID.');
  const { data, error } = await supabase.from('water_readings').delete().eq('id', id).select('id').maybeSingle();
  if (error) return dbError(res, error, 'delete reading');
  if (!data) return sendError(res, 404, 'Reading not found.');
  res.json({ success: true, data: { id: data.id } });
});

app.get('/api/settings', requireDb, async (req, res) => {
  const { data, error } = await supabase.from('dashboard_settings').select('*').eq('id', 1).single();
  if (error) return dbError(res, error, 'get settings');
  res.json({ success: true, data });
});
app.put('/api/settings', requireDb, async (req, res) => {
  const { error: validationError, value } = validateSettings(req.body || {});
  if (validationError) return sendError(res, 400, validationError, { daily_target_m3: validationError });
  const { data, error } = await supabase.from('dashboard_settings').upsert({ id: 1, daily_target_m3: value }).select('*').single();
  if (error) return dbError(res, error, 'save settings');
  res.json({ success: true, data });
});

app.get('/api/summary', requireDb, async (req, res) => {
  const { data: readings, error } = await supabase.from('water_readings').select('id,reading_date,meter_reading_m3,category').order('reading_date', { ascending: true });
  if (error) return dbError(res, error, 'summary readings');
  const { data: settings, error: settingsError } = await supabase.from('dashboard_settings').select('daily_target_m3').eq('id', 1).single();
  if (settingsError) return dbError(res, settingsError, 'summary settings');
  const rows = readings || [];
  const daily = rows.map((r, i) => ({ ...r, usage_m3: i === 0 ? null : Number((Number(r.meter_reading_m3) - Number(rows[i - 1].meter_reading_m3)).toFixed(3)) }));
  const usable = daily.filter(r => r.usage_m3 !== null);
  const last = usable[usable.length - 1] || null;
  const previous = usable[usable.length - 2] || null;
  const last30 = usable.slice(-30);
  const total30 = Number(last30.reduce((sum, r) => sum + r.usage_m3, 0).toFixed(3));
  const avg = last30.length ? Number((total30 / last30.length).toFixed(3)) : 0;
  res.json({ success: true, data: { readingCount: rows.length, latestMeterReading: rows.length ? Number(rows[rows.length - 1].meter_reading_m3) : null, latestDate: rows.length ? rows[rows.length - 1].reading_date : null, latestUsage: last ? last.usage_m3 : null, previousUsage: previous ? previous.usage_m3 : null, changePercent: last && previous && previous.usage_m3 !== 0 ? Number((((last.usage_m3 - previous.usage_m3) / previous.usage_m3) * 100).toFixed(1)) : null, usageLast30Intervals: total30, averagePerInterval: avg, dailyTarget: Number(settings.daily_target_m3), readings: daily.slice(-14) } });
});

app.use('/api', (req, res) => sendError(res, 404, 'API endpoint not found.'));
app.get('*path', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) return sendError(res, 400, 'Invalid JSON request body.');
  console.error('[server]', err?.message || 'Unknown error');
  return sendError(res, 500, 'An unexpected server error occurred.');
});

try {
  supabase = createSupabaseClient();
} catch (error) {
  console.warn(error.message);
}
app.listen(PORT, () => console.log(`Water Usage Tracking Dashboard running at http://localhost:${PORT}`));
