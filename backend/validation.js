const VALID_CATEGORIES = ['Household', 'Bathroom', 'Kitchen', 'Laundry', 'Garden', 'Cleaning', 'Other'];

function validateReading(body) {
  const errors = {};
  const readingDate = typeof body.reading_date === 'string' ? body.reading_date : '';
  const meterReading = Number(body.meter_reading_m3);
  const category = typeof body.category === 'string' ? body.category : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readingDate) || Number.isNaN(Date.parse(`${readingDate}T00:00:00Z`)) || new Date(`${readingDate}T00:00:00Z`).toISOString().slice(0, 10) !== readingDate) errors.reading_date = 'Enter a valid date.';
  if (!Number.isFinite(meterReading) || meterReading < 0 || meterReading > 100000000 || !/^\d+(\.\d{1,3})?$/.test(String(body.meter_reading_m3 ?? ''))) errors.meter_reading_m3 = 'Meter reading must be a non-negative number with up to 3 decimal places.';
  if (!VALID_CATEGORIES.includes(category)) errors.category = 'Choose a valid category.';
  if (notes.length > 500) errors.notes = 'Notes must be 500 characters or fewer.';
  return { errors, value: { reading_date: readingDate, meter_reading_m3: meterReading, category, notes: notes || null } };
}

function validateSettings(body) {
  const target = Number(body.daily_target_m3);
  if (!Number.isFinite(target) || target <= 0 || target > 100000 || !/^\d+(\.\d{1,3})?$/.test(String(body.daily_target_m3 ?? ''))) {
    return { error: 'Daily target must be greater than 0 and have up to 3 decimal places.' };
  }
  return { value: target };
}

module.exports = { validateReading, validateSettings, VALID_CATEGORIES };
