// Weather — the one part of the launchpad that talks to the network, so it is
// off until you pick a place and it only ever calls Open-Meteo:
//
//   • no account, no API key, no cookies, nothing identifying is sent
//   • coordinates are rounded to 2 decimals (~1 km) before they leave the page
//   • the manifest's connect-src allows these two origins and nothing else
//
// Readings are cached for 20 minutes so switching back to the launchpad does
// not mean a request every time.

import { readingFrom, roundCoord, sanitizePlace } from './model.js';
import { readLocal, writeLocal } from './dom.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const CACHE_KEY = 'launchpad:weather:v2'; // v2: readings gained rainChance, sunrise, sunset
const FRESH_FOR = 20 * 60_000;
const TIMEOUT = 8000;

async function getJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Up to five matching places for a typed city name.
export async function searchPlaces(query, language = 'en') {
  const text = query.trim();
  if (text.length < 2) return [];
  const u = new URL(GEOCODE);
  u.searchParams.set('name', text);
  u.searchParams.set('count', '5');
  u.searchParams.set('language', language.slice(0, 2));
  u.searchParams.set('format', 'json');
  const data = await getJson(u);
  return (data.results ?? []).map((r) => ({
    lat: roundCoord(r.latitude),
    lon: roundCoord(r.longitude),
    name: r.name,
    // "Chiang Mai · Thailand", with the region only when it adds something.
    detail: [r.admin1 !== r.name ? r.admin1 : null, r.country].filter(Boolean).join(' · '),
  }));
}

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude), name: '' }),
      reject,
      { timeout: TIMEOUT, maximumAge: 10 * 60_000, enableHighAccuracy: false },
    );
  });
}

const cacheKey = (place) => `${place.lat},${place.lon},${place.unit}`;

export async function loadWeather(rawPlace, { force = false } = {}) {
  const place = sanitizePlace(rawPlace);
  if (!place) return null;

  const cached = readLocal(CACHE_KEY, null);
  if (!force && cached?.key === cacheKey(place) && Date.now() - cached.at < FRESH_FOR) return cached.reading;

  const u = new URL(FORECAST);
  u.searchParams.set('latitude', String(place.lat));
  u.searchParams.set('longitude', String(place.lon));
  u.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day');
  u.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,sunrise,sunset');
  // Six hours starting from the current one: enough to answer "will it rain soon".
  u.searchParams.set('hourly', 'precipitation_probability');
  u.searchParams.set('forecast_hours', '6');
  u.searchParams.set('forecast_days', '1');
  u.searchParams.set('timezone', 'auto');
  u.searchParams.set('temperature_unit', place.unit === 'f' ? 'fahrenheit' : 'celsius');

  const reading = readingFrom(await getJson(u), place, Date.now());
  writeLocal(CACHE_KEY, { key: cacheKey(place), at: Date.now(), reading });
  return reading;
}

// The last reading for this place however old it is, for when a refresh fails:
// an old reading marked as old beats an empty pill.
export function lastReading(rawPlace) {
  const place = sanitizePlace(rawPlace);
  const cached = readLocal(CACHE_KEY, null);
  return place && cached?.key === cacheKey(place) ? cached.reading : null;
}

export const clearWeatherCache = () => writeLocal(CACHE_KEY, null);
