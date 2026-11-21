'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const editor = $('#editor');
const viewer = $('#viewer');
const form = $('#journal');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const tempoNames = {slow: 'медленный', mid: 'средний', fast: 'быстрый'};
const toneNames = {soft: 'мягкое', bright: 'светлое', deep: 'глубокое'};
const moodRules = [
  {name: 'Тихий', words: /тих|спокой|осен|какао|парк|дожд|уют/giu, color: [154,101,70], grain: .5, angle: 17},
  {name: 'Напряжённый', words: /сроч|дедлайн|спеш|ноч|работ|сдач|устал/giu, color: [86,103,153], grain: .8, angle: 90},
  {name: 'Светлый', words: /солнц|радост|мор[ея]|сме[хя]|лет[оа]|счаст|праздник/giu, color: [104,147,117], grain: .24, angle: 0},
  {name: 'Созерцательный', words: /$/gu, color: [130,118,107], grain: .35, angle: 30}
];

const demoSource = [
  ['park', '2026-10-17', 'Осенний парк и какао', 'В осеннем парке всё было тихо. Листья липли к дорожке после дождя, а над прудом стоял туман. Мы взяли горячее какао и долго разговаривали.', 'slow', 'soft', [173,105,58]],
  ['city', '2026-11-09', 'Ночь перед сдачей проекта', 'Срочная сдача проекта. Ночь, свет мониторов и последний автобус за окном. В наушниках быстрая музыка, мы спешили проверить всё ещё раз.', 'fast', 'deep', [46,62,105]],
  ['sea', '2026-08-03', 'Солнце над тихим морем', 'Утром мы пошли к морю. Солнце было низко, песок ещё холодный, а вокруг слышался смех. Потом мы долго сидели на берегу.', 'mid', 'bright', [127,174,165]]
];

function composition(story, colors, tempo, tone) {
  const matches = rule => [...story.matchAll(rule.words)].length;
  const mood = moodRules.slice(0, 3).reduce((best, rule) =>
    matches(rule) > (best ? matches(best) : 0) ? rule : best, null) || moodRules[3];
  const average = [0,1,2].map(channel =>
    colors.reduce((sum, rgb) => sum + rgb[channel], 0) / colors.length);
  const mix = average.map((value, channel) => {
    const lift = {soft: 14, bright: 31, deep: -16}[tone];
    return Math.max(0, Math.min(255, Math.round(value * .68 + mood.color[channel] * .32 + lift)));
  });
  return {
    mood: mood.name,
    accent: 'rgb(' + mix.join(',') + ')',
    filter: {soft:'contrast(.91) brightness(1.04)', bright:'saturate(1.2) brightness(1.1)', deep:'contrast(1.2) brightness(.86)'}[tone],
    grain: mood.grain,
    angle: mood.angle,
    interval: {slow:6200, mid:4100, fast:2400}[tempo]
  };
}

const demos = demoSource.map(([id, date, title, story, tempo, tone, color]) => ({
  id: 'demo-' + id, date, title, story, tempo, tone, demo: true,
  photos: ['demo/' + id + '.jpg', 'demo/' + id + '-2.jpg'],
  music: 'demo/' + id + '.wav', source: 'file',
  look: composition(story, [color], tempo, tone)
}));

function openArchive() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('poslesvet', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('days', {keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const database = openArchive();
async function transact(mode, perform) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('days', mode);
    const request = perform(transaction.objectStore('days'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

function element(tag, value, cls) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  if (cls) node.className = cls;
  return node;
}
const dateLabel = date => new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'});
const titleFrom = story => {
  const sentences = story.split(/[.!?\n]/u).map(line => line.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) || []);
  const fillers = /^(ну|я|мы|просто|вообще|сегодня|было)$/iu;
  const useful = sentences.map(words => words.filter(word => !fillers.test(word)));
  const phrase = useful.find(words => words.length >= 3) || useful.flat();
  if (phrase.length === 0) return 'Как прошёл день';
  if (phrase.length === 1) return 'День про ' + phrase[0].slice(0,45);
  const words = phrase.length === 2 ? ['День:', ...phrase] : phrase.slice(0, 6);
  const title = words.map(word => word.slice(0, 35)).join(' ');
  return title[0].toUpperCase() + title.slice(1);
};

let saved = [];
let cardUrls = [];
let viewerUrls = [];
let timer;
function mediaUrl(value, urls) {
  if (typeof value === 'string') return value;
  const url = URL.createObjectURL(value);
  urls.push(url);
  return url;
}

function renderArchive() {
  const archive = $('#entries');
  archive.replaceChildren();
  cardUrls.forEach(url => URL.revokeObjectURL(url));
  cardUrls = [];
  const query = $('#search').value.trim().toLowerCase();
  const entries = [...saved, ...demos].sort((a,b) => b.date.localeCompare(a.date));
  for (const day of entries) {
    if (!(day.title + ' ' + day.story).toLowerCase().includes(query)) continue;
    const card = element('button', '', 'day');
    card.type = 'button';
    card.style.setProperty('--accent', day.look.accent);
    const image = element('img');
    image.src = mediaUrl(day.photos[0], cardUrls);
    image.alt = '';
    image.loading = 'lazy';
    const meta = element('span', '', 'card-meta');
    meta.append(element('span', dateLabel(day.date) + (day.demo ? ' · Пример' : ''), 'date'), element('strong', day.title));
    card.append(image, meta);
    card.addEventListener('click', () => showDay(day));
    archive.append(card);
  }
  if (!archive.childElementCount) archive.append(element('p','По этому запросу ничего не найдено.'));
}

function showDay(day) {
  const memory = $('#memory');
  memory.replaceChildren();
  const opening = element('div', '', 'opening');
  opening.style.setProperty('--accent', day.look.accent);
  opening.style.setProperty('--grain', day.look.grain);
  opening.style.setProperty('--grain-angle', day.look.angle + 'deg');
  opening.style.setProperty('--filter', day.look.filter);
  const figure = element('figure');
  const close = element('button', '×', 'close');
  close.setAttribute('aria-label','Закрыть');
  close.addEventListener('click', () => viewer.close());
  opening.append(figure, close);
  let frame = 0;
  const frames = day.photos.map(photo => mediaUrl(photo, viewerUrls));
  const counter = element('span');
  function showFrame(offset) {
    frame = (frame + offset + frames.length) % frames.length;
    const image = element('img');
    image.alt = 'Кадр ' + (frame + 1) + ' из ' + frames.length;
    image.src = frames[frame];
    figure.replaceChildren(image);
    counter.textContent = (frame + 1) + ' / ' + frames.length;
  }
  const body = element('div', '', 'memory-body');
  const title = element('h2',day.title);
  title.id = 'day-title';
  body.append(element('div',dateLabel(day.date) + (day.demo ? ' · Вымышленный день' : ''), 'date'), title);
  if (frames.length > 1) {
    const controls = element('div','','controls');
    const prev = element('button','←');
    prev.setAttribute('aria-label','Предыдущий кадр');
    prev.onclick = () => showFrame(-1);
    const next = element('button','→');
    next.setAttribute('aria-label','Следующий кадр');
    next.onclick = () => showFrame(1);
    const play = element('button','Запустить смену кадров');
    play.onclick = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
        play.textContent = 'Запустить смену кадров';
      } else {
        timer = setInterval(() => showFrame(1), day.look.interval);
        play.textContent = 'Остановить смену кадров';
      }
    };
    controls.append(prev,counter,next,play);
    if (reducedMotion.matches) play.hidden = true;
    body.append(controls);
  }
  body.append(element('p',day.story,'story'));
  if (day.source === 'file') {
    const audio = element('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = mediaUrl(day.music, viewerUrls);
    body.append(audio);
  } else {
    const link = element('a','Открыть песню ↗');
    link.href = day.music;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    body.append(link);
  }
  const explanation = element('details');
  explanation.append(element('summary','Как собрано оформление'), element('p',
    'Текст → ' + day.look.mood.toLowerCase() + ' настрой и фактура. Цвета фотографий → оттенок рамки. ' +
    'Темп → ' + (day.look.interval / 1000).toLocaleString('ru') + ' с на кадр (' + tempoNames[day.tempo] +
    '). Характер звучания → ' + toneNames[day.tone] + ' освещение и контраст.'));
  body.append(explanation);
  if ('speechSynthesis' in window) {
    const speak = element('button','Озвучить запись');
    speak.onclick = () => {
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        speak.textContent = 'Озвучить запись';
        return;
      }
      const voice = new SpeechSynthesisUtterance(day.story);
      voice.lang = 'ru-RU';
      voice.rate = {slow:.82,mid:1,fast:1.16}[day.tempo];
      voice.pitch = {soft:.92,bright:1.12,deep:.79}[day.tone];
      voice.onend = voice.onerror = () => { speak.textContent = 'Озвучить запись'; };
      speak.textContent = 'Остановить озвучку';
      speechSynthesis.speak(voice);
    };
    body.append(speak);
  }
  memory.append(opening,body);
  showFrame(0);
  viewer.showModal();
}

viewer.addEventListener('close', () => {
  clearInterval(timer);
  timer = undefined;
  window.speechSynthesis?.cancel();
  $('#memory').replaceChildren();
  viewerUrls.forEach(url => URL.revokeObjectURL(url));
  viewerUrls = [];
});

async function preparePhoto(file) {
  const image = await createImageBitmap(file);
  try {
    const canvas = element('canvas');
    const scale = Math.min(1, 1400 / Math.max(image.width,image.height));
    canvas.width = Math.max(1,Math.round(image.width * scale));
    canvas.height = Math.max(1,Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f3eb';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',.85));
    const thumb = element('canvas');
    thumb.width = thumb.height = 20;
    const small = thumb.getContext('2d');
    small.drawImage(canvas,0,0,20,20);
    const pixels = small.getImageData(0,0,20,20).data;
    const color = [0,1,2].map(channel => {
      let sum = 0;
      for (let i = channel; i < pixels.length; i += 4) sum += pixels[i];
      return sum / 400;
    });
    if (!blob) throw new Error('Не удалось обработать фотографию.');
    return {blob,color};
  } finally {
    image.close();
  }
}

async function audioTempo(file, fallback) {
  let ctx;
  try {
    ctx = new AudioContext();
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const samples = buffer.getChannelData(0);
    const hop = Math.round(buffer.sampleRate / 50);
    const count = Math.min(2250, Math.floor(samples.length / hop));
    const onset = [];
    let previous = 0;
    for (let i = 0; i < count; i++) {
      let energy = 0;
      for (let j = 0; j < hop; j += 4) energy += Math.abs(samples[i * hop + j]);
      onset.push(Math.max(0, energy - previous));
      previous = energy;
    }
    let best = 0;
    let period = 0;
    for (let lag = 18; lag <= 47; lag++) {
      let product = 0, firstPower = 0, secondPower = 0;
      for (let i = lag; i < count; i++) {
        product += onset[i] * onset[i-lag];
        firstPower += onset[i] ** 2;
        secondPower += onset[i-lag] ** 2;
      }
      const score = product / Math.sqrt(firstPower * secondPower);
      if (score > best) { best = score; period = lag; }
    }
    if (best < .26 || count < 180) return fallback;
    const bpm = 3000 / period;
    return bpm < 86 ? 'slow' : bpm > 124 ? 'fast' : 'mid';
  } catch {
    return fallback;
  } finally {
    if (ctx) await ctx.close();
  }
}

form.elements.source.addEventListener('change', () => {
  const upload = form.elements.source.value === 'file';
  $('#file-fields').hidden = !upload;
  $('#link-fields').hidden = upload;
  form.elements.track.required = upload;
  form.elements.url.required = !upload;
});
document.querySelectorAll('[data-compose]').forEach(button => button.addEventListener('click', () => {
  if (!form.elements.date.value) {
    const now = new Date();
    form.elements.date.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,10);
  }
  editor.showModal();
}));
$('[data-close]').onclick = () => editor.close();
$('#search').oninput = renderArchive;

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(form);
  const source = data.get('source');
  const story = data.get('entry').trim();
  const photos = Array.from(form.elements.photos.files);
  const button = $('#submit');
  const original = button.textContent;
  $('#error').textContent = '';
  button.disabled = true;
  button.textContent = 'Собираем…';
  try {
    if (!story) throw new Error('Добавь текст о своём дне.');
    if (photos.length < 1 || photos.length > 8 || photos.some(file => file.size > 20 * 1024 ** 2)) {
      throw new Error('Выбери от 1 до 8 фотографий размером до 20 МБ каждая.');
    }
    let music;
    let tempo = data.get('tempo');
    if (source === 'link') {
      const url = new URL(data.get('url').trim());
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Нужна ссылка на песню, начинающаяся с https://.');
      music = url.href;
    } else {
      music = data.get('track');
      if (!music.size || music.size > 30 * 1024 ** 2) throw new Error('Выбери аудиофайл размером до 30 МБ.');
      tempo = await audioTempo(music, tempo);
    }
    const prepared = [];
    for (const file of photos) prepared.push(await preparePhoto(file));
    const tone = data.get('tone');
    const day = {id: crypto.randomUUID(), title: titleFrom(story), date: data.get('date'),
      story, photos: prepared.map(photo => photo.blob), music, tone, tempo, source,
      look: composition(story, prepared.map(photo => photo.color), tempo, tone)};
    await transact('readwrite', store => store.add(day));
    saved.push(day);
    $('#search').value = '';
    renderArchive();
    editor.close();
    form.reset();
    form.elements.source.dispatchEvent(new Event('change'));
    showDay(day);
  } catch (error) {
    $('#error').textContent = error.name === 'QuotaExceededError' ? 'Не хватает места в браузере. Попробуй меньшие файлы.' :
      error.name === 'InvalidStateError' ? 'Не удалось прочитать изображение. Попробуй JPG или PNG.' : error.message;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

renderArchive();
transact('readonly', store => store.getAll()).then(days => {
  saved = days;
  renderArchive();
}).catch(() => {
  $('#notice').textContent = 'Архив браузера недоступен. Можно открыть демонстрационные дни.';
});
