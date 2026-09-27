import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readingFrom } from '../js/model.js';

// weather.js reads localStorage and fetch at call time, so both are stubbed on
// globalThis before it is imported.
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  },
});

let calls = [];
let respond = () => ({ ok: true, json: async () => FORECAST });
globalThis.fetch = async (url) => { calls.push(new URL(url)); return respond(); };

const { lastReading, loadWeather } = await import('../js/weather.js');

const FORECAST = {
  current: { temperature_2m: 25.6, apparent_temperature: 28.4, relative_humidity_2m: 88, weather_code: 61, is_day: 1 },
  daily: { temperature_2m_max: [27.8], temperature_2m_min: [24.1], sunrise: ['2026-09-27T06:07'], sunset: ['2026-09-27T18:10'] },
  hourly: { precipitation_probability: [40, 90, null, 75] },
};
const PLACE = { lat: 13.754_321, lon: 100.501_234, name: 'Bangkok', unit: 'c' };

beforeEach(() => { store.clear(); calls = []; respond = () => ({ ok: true, json: async () => FORECAST }); });

test('readingFrom: rounds, takes the wettest coming hour, reads local sun times', () => {
  const r = readingFrom(FORECAST, { unit: 'c', name: 'Bangkok' }, 123);
  assert.deepEqual(
    { temp: r.temp, feels: r.feels, humidity: r.humidity, low: r.low, high: r.high },
    { temp: 26, feels: 28, humidity: 88, low: 24, high: 28 });
  assert.equal(r.rainChance, 90);
  assert.equal(r.sunrise, '06:07');
  assert.equal(r.sunset, '18:10');
  assert.equal(r.bucket, 'rain');
  assert.equal(r.at, 123);
});

test('readingFrom: missing optional blocks degrade, a missing temperature throws', () => {
  const r = readingFrom({ current: { temperature_2m: 20 } }, { unit: 'f', name: '' }, 0);
  assert.equal(r.rainChance, null);
  assert.equal(r.sunrise, '');
  assert.equal(r.unit, 'f');
  assert.throws(() => readingFrom({ current: {} }, { unit: 'c' }, 0), /no reading/);
});

test('loadWeather: sends only rounded coordinates and the fields it paints', async () => {
  await loadWeather(PLACE);
  assert.equal(calls.length, 1);
  const q = calls[0].searchParams;
  assert.equal(calls[0].origin, 'https://api.open-meteo.com');
  assert.equal(q.get('latitude'), '13.75');
  assert.equal(q.get('longitude'), '100.5');
  assert.equal(q.get('hourly'), 'precipitation_probability');
  assert.equal(q.get('forecast_hours'), '6');
  assert.ok(!calls[0].search.includes('Bangkok'), 'the place name never leaves the page');
});

test('loadWeather: a fresh cached reading answers without a request; force refetches', async () => {
  const first = await loadWeather(PLACE);
  const second = await loadWeather(PLACE);
  assert.equal(calls.length, 1);
  assert.deepEqual(second, first);
  await loadWeather(PLACE, { force: true });
  assert.equal(calls.length, 2);
  await loadWeather({ ...PLACE, unit: 'f' });
  assert.equal(calls.length, 3, 'a different unit is a different cache entry');
});

test('loadWeather: an HTTP error throws, and lastReading still has the old one', async () => {
  const good = await loadWeather(PLACE);
  respond = () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(loadWeather(PLACE, { force: true }), /HTTP 503/);
  assert.deepEqual(lastReading(PLACE), good);
  assert.equal(lastReading({ ...PLACE, lat: 1 }), null, 'never another place\'s reading');
});

test('loadWeather: no usable place means no request at all', async () => {
  assert.equal(await loadWeather(null), null);
  assert.equal(await loadWeather({ lat: 200, lon: 0 }), null);
  assert.equal(calls.length, 0);
});
