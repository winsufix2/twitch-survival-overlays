const moscow = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});

export function donationTime(donation) {
  const source = String(donation.createdAt || '').trim();
  const plain = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(source);
  // DA supplies a calendar time without an offset. Preserve it rather than
  // letting Safari/Chrome infer a different timezone or reject the SQL format.
  if (plain) {
    const [, year, month, day, hour, minute, second] = plain;
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0,19) === source.replace(' ', 'T')) {
      return {text: `${day}.${month}.${year} ${hour}:${minute}:${second}`, title: 'Дата и время из DonationAlerts; часовой пояс в ответе не указан'};
    }
  } else if (source && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(source)) {
    const date = new Date(source);
    if (Number.isFinite(date.getTime())) return {text: moscow.format(date), title: 'Дата доната, московское время'};
  }
  if (donation.kind === 'test' && Number.isFinite(donation.receivedAt)) {
    return {text: moscow.format(new Date(donation.receivedAt)), title: 'Время тестового доната, Москва'};
  }
  return {text: 'Не указано', title: 'DonationAlerts не передал корректную дату доната'};
}

export function donationAmount(donation) {
  return Number(donation.amount).toLocaleString('ru-RU', {maximumFractionDigits: 2}) +
    ' ' + (donation.currency === 'RUB' ? '₽' : donation.currency);
}
