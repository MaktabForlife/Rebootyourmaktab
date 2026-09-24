/* Shared timezone choices for Program setup and timetable drafts. */
(() => {
  'use strict';
  const defaultZone = 'Africa/Johannesburg';
  const fallback = [defaultZone, 'Africa/Cairo', 'Africa/Lagos', 'Africa/Nairobi',
    'America/Chicago', 'America/Los_Angeles', 'America/New_York', 'America/Toronto',
    'Asia/Dhaka', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kuala_Lumpur',
    'Asia/Riyadh', 'Asia/Singapore', 'Australia/Sydney', 'Europe/London', 'Europe/Paris',
    'Pacific/Auckland', 'UTC'];
  let zones = fallback;
  try { zones = [...fallback, ...Intl.supportedValuesOf('timeZone')]; } catch { /* Older browsers use common choices. */ }
  zones = [...new Set(zones)].filter(zone => zone !== defaultZone).sort();
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  function options(selected = '') {
    // Retain saved aliases and pending values instead of silently changing them.
    const choices = [defaultZone, ...zones];
    if (selected && !choices.includes(selected)) choices.push(selected);
    return `<option value="" ${selected === '' ? 'selected' : ''}>Choose timezone…</option>` + choices.map(zone =>
      `<option value="${escape(zone)}" ${zone === selected ? 'selected' : ''}>${escape(zone === defaultZone ? 'South Africa — Africa/Johannesburg' : zone)}</option>`
    ).join('');
  }
  window.M4L_TIMEZONES = Object.freeze({ defaultZone, options });
})();
