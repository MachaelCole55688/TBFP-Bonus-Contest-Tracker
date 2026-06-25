const fs = require('fs');
const https = require('https');

const DEFAULT_SPREADSHEET_ID = '1KoimJYlZEiAK5Y_kXgJ85_VBKWGP3hRabv2zva-ahAo';
const DEFAULT_SHEET_GIDS = ['69157915', '919748816'];
const DEFAULT_YEAR = 2026;

function taipeiDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offsetDays);
  return new Date(utc).toISOString().slice(0, 10);
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`Could not read Google Sheet CSV. HTTP ${response.statusCode}`));
        response.resume();
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
      });
      response.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeDate(raw, fallbackYear) {
  const value = String(raw || '').trim();
  const match = value.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const month = match[1].padStart(2, '0');
  const day = match[2].padStart(2, '0');
  return `${fallbackYear}-${month}-${day}`;
}

function formatDateLabel(isoDate) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    month: 'long',
    day: 'numeric'
  }).format(new Date(`${isoDate}T00:00:00+08:00`));
}

function formatDayLabel(isoDate) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short'
  }).format(new Date(`${isoDate}T00:00:00+08:00`)) + '.';
}

function numberOrNull(value) {
  const cleaned = String(value || '').replace(/[₱,\s]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanContestName(value) {
  const normalized = String(value || '')
    .replace(/\(GPP\)/gi, '')
    .replace(/折抵\d+塊/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  if (/winner takes all/i.test(normalized)) return '👑 Winner Takes All';
  if (/world cup kickoff clash/i.test(normalized)) return '🌍 World Cup Kickoff Clash';
  if (/ruby swap/i.test(normalized)) return '🔄 Ruby Swap';
  return normalized;
}

function isRubyContest(name) {
  return /RUBY BONUS/i.test(name) || /^100K\b/i.test(name) || /^500K\b/i.test(name);
}

function isGuaranteedPrizePool(league, contest) {
  return (league === 'FIFA' && /World Cup Kickoff Clash/i.test(contest))
    || (league === 'WNBA' && /Winner Takes All/i.test(contest));
}

function defaultGuaranteedPrize(league, contest) {
  if (league === 'WNBA' && /Winner Takes All/i.test(contest)) return 300;
  if (league === 'FIFA' && /World Cup Kickoff Clash/i.test(contest)) return 500;
  return null;
}

function normalizeIds(league, rawMatchId, rawContestId) {
  let matchId = String(rawMatchId || '').trim();
  let contestId = String(rawContestId || '').trim();

  const looksLikeContestId = value => /^19\d{4,}$/.test(value);
  const looksLikeFifaMatchId = value => /^39\d{4,}$/.test(value);

  if (league === 'FIFA' && looksLikeContestId(matchId) && looksLikeFifaMatchId(contestId)) {
    [matchId, contestId] = [contestId, matchId];
  }

  return { matchId, contestId };
}

function buildData(rows, options = {}) {
  const showFrom = options.showFrom || taipeiDate(0);
  const fallbackYear = options.fallbackYear || DEFAULT_YEAR;
  const data = [];
  let currentDate = null;

  rows.slice(3).forEach(row => {
    const rowDate = normalizeDate(row[0], fallbackYear);
    if (rowDate) currentDate = rowDate;
    if (!currentDate || currentDate < showFrom) return;

    const league = String(row[1] || '').trim();
    const contest = cleanContestName(row[6]);
    const game = String(row[7] || '').trim();
    const ids = normalizeIds(league, row[8], row[9]);
    const entry = numberOrNull(row[10]);
    const participants = numberOrNull(row[11]);
    const slips = numberOrNull(row[12]);
    const spots = numberOrNull(row[13]);
    const extraBonus = numberOrNull(row[17]);

    if (!league || !contest || !game || entry == null) return;

    const item = {
      date: currentDate,
      label: formatDateLabel(currentDate),
      day: formatDayLabel(currentDate),
      league,
      contest,
      game,
      matchId: ids.matchId,
      contestId: ids.contestId,
      entry,
      participants,
      slips,
      spots
    };

    if (isRubyContest(contest)) item.ruby = true;

    if (isGuaranteedPrizePool(league, contest)) {
      item.guaranteedPrize = extraBonus || defaultGuaranteedPrize(league, contest);
    } else if (extraBonus) {
      item.bonus = extraBonus;
    }

    data.push(item);
  });

  return data;
}

function replaceDataBlock(html, data) {
  const replacement = `const DATA = ${JSON.stringify(data, null, 2)};`;
  if (html.includes('const HIDDEN_MATCHES = new Set([')) {
    return html.replace(/const DATA = [\s\S]*?;\n\nconst HIDDEN_MATCHES/, `${replacement}\n\nconst HIDDEN_MATCHES`);
  }
  return html.replace(/const DATA = [\s\S]*?;\n\nfunction matchLink/, `${replacement}\n\nfunction matchLink`);
}

function updateHtmlFiles(htmlPaths, data) {
  htmlPaths.forEach(htmlPath => {
    if (!fs.existsSync(htmlPath)) {
      throw new Error(`HTML file not found: ${htmlPath}`);
    }

    const original = fs.readFileSync(htmlPath, 'utf8');
    const updated = replaceDataBlock(original, data);

    if (updated === original) {
      throw new Error(`Could not find DATA block in ${htmlPath}`);
    }

    fs.writeFileSync(htmlPath, updated);
  });
}

async function runUpdate(options = {}) {
  const spreadsheetId = options.spreadsheetId || process.env.SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const configuredGids = options.sheetGids
    || (process.env.SHEET_GIDS ? process.env.SHEET_GIDS.split(',').map(value => value.trim()).filter(Boolean) : null)
    || (process.env.SHEET_GID ? [process.env.SHEET_GID] : null)
    || DEFAULT_SHEET_GIDS;
  const showFrom = options.showFrom || process.env.SHOW_FROM || taipeiDate(0);
  const fallbackYear = options.fallbackYear || Number(process.env.SHEET_YEAR || DEFAULT_YEAR);
  const htmlPaths = options.htmlPaths || ['index.html'];
  const gids = [...new Set(configuredGids)];

  const allData = [];
  const csvUrls = [];

  for (const gid of gids) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
    const csv = await fetchText(csvUrl);
    const rows = parseCsv(csv);
    const data = buildData(rows, { showFrom, fallbackYear });
    allData.push(...data);
    csvUrls.push(csvUrl);
  }

  const data = allData
    .sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare) return dateCompare;
      const leagueCompare = String(a.league).localeCompare(String(b.league));
      if (leagueCompare) return leagueCompare;
      const gameCompare = String(a.game).localeCompare(String(b.game));
      if (gameCompare) return gameCompare;
      return String(a.contestId || '').localeCompare(String(b.contestId || ''));
    })
    .filter((item, index, list) => {
      const key = [item.date, item.league, item.game, item.contest, item.matchId || '', item.contestId || ''].join('|');
      return index === list.findIndex(entry => [entry.date, entry.league, entry.game, entry.contest, entry.matchId || '', entry.contestId || ''].join('|') === key);
    });

  updateHtmlFiles(htmlPaths, data);

  const matchCount = new Set(data.map(item => [item.date, item.league, item.game, item.matchId || 'pending'].join('|'))).size;

  console.log(`Google Sheet CSVs: ${csvUrls.join(' , ')}`);
  console.log(`Showing from: ${showFrom}`);
  console.log(`Contest rows: ${data.length}`);
  console.log(`Match cards: ${matchCount}`);
  htmlPaths.forEach(htmlPath => console.log(`Updated: ${htmlPath}`));

  return { data, matchCount, showFrom, csvUrls };
}

module.exports = {
  buildData,
  parseCsv,
  runUpdate,
  taipeiDate
};
