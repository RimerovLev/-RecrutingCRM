export function isMissingTableError(error, tableName) {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    const code = error.code || '';
    return (
      code === 'PGRST205' ||
      code === '42P01' ||
      (msg.includes('could not find') && msg.includes(tableName.toLowerCase()))
    );
  }