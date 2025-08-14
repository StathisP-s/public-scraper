const fs = require('fs');
function exportToCSV(rows, filepath) {
  if (!rows || !rows.length) { fs.writeFileSync(filepath, ''); return; }
  const headers = Object.keys(rows[0]);
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(','))
  ];
  fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');
}
module.exports = { exportToCSV };
