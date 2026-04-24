import { FreeAtHome, WeatherStationChannels } from '@busch-jaeger/free-at-home';
import { AddOn } from '@busch-jaeger/free-at-home';
import {
  geocodeCity,
  fetchWeather,
  estimateBrightnessLux,
  enableKeepAlive,
  markStationUnresponsive,
} from './weatherUtils.js';

const DEFAULT_UPDATE_INTERVAL_MIN = 15;
const DEFAULT_FORECAST_DAYS = 0;
const MAX_FORECAST_DAYS = 5;
const RETRY_DELAY_MS = 30_000;

// ── SDK init ──────────────────────────────────────────────────────────────────

const freeAtHome = new FreeAtHome();
freeAtHome.activateSignalHandling();

const metaData = AddOn.readMetaData();
const addOn = new AddOn.AddOn(metaData.id);

let currentStation: WeatherStationChannels | null = null;
const forecastStations = new Map<number, WeatherStationChannels>();
let updateTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let currentLat: number | null = null;
let currentLon: number | null = null;
let activeForecastDays = DEFAULT_FORECAST_DAYS;

// ── Device management ─────────────────────────────────────────────────────────

async function ensureForecastDevices(days: number): Promise<void> {
  for (let i = 1; i <= days; i++) {
    if (!forecastStations.has(i)) {
      const station = await freeAtHome.createWeatherStationDevice(
        `weather-station-forecast-${i}`,
        `Wetterstation - Tag ${i}`
      );
      enableKeepAlive(station);
      forecastStations.set(i, station);
      console.log(`Vorhersage-Gerät erstellt: Wetterstation - Tag ${i}`);
    }
  }
}

async function deactivateExcessForecastDevices(newDays: number, previousDays: number): Promise<void> {
  for (let i = newDays + 1; i <= previousDays; i++) {
    const station = forecastStations.get(i);
    if (station) {
      await markStationUnresponsive(station);
      console.log(`Wetterstation - Tag ${i} als nicht erreichbar markiert`);
    }
  }
}

// ── Weather update ────────────────────────────────────────────────────────────

async function updateWeather(): Promise<void> {
  if (currentStation === null || currentLat === null || currentLon === null) return;

  const result = await fetchWeather(currentLat, currentLon, activeForecastDays);
  if (!result) {
    console.error('Wetterdaten konnten nicht abgerufen werden – Wiederholung in 30 s');
    if (retryTimer === null) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        updateWeather().catch(console.error);
      }, RETRY_DELAY_MS);
    }
    return;
  }

  const { current, forecast } = result;

  currentStation.temperature.setTemperature(current.temperature);
  currentStation.wind.setWindSpeed(current.windSpeed);
  currentStation.rain.setIsRaining(current.precipitation > 0);
  const currentLux = estimateBrightnessLux(current.cloudCover, current.isDay);
  currentStation.brightness.setBrightnessLevel(currentLux);

  console.log(
    `Aktuell: ${current.temperature}°C, Wind ${current.windSpeed} km/h, ` +
    `Regen: ${current.precipitation > 0 ? 'ja' : 'nein'}, Helligkeit: ${currentLux} lux`
  );

  for (let i = 0; i < forecast.length; i++) {
    const day = forecast[i];
    const station = forecastStations.get(i + 1);
    if (!station) continue;

    const lux = estimateBrightnessLux(day.cloudCoverMean, 1);
    station.temperature.setTemperature(day.tempMax);
    station.wind.setWindSpeed(day.windSpeedMax);
    station.rain.setIsRaining(day.precipitation > 0);
    station.brightness.setBrightnessLevel(lux);

    console.log(
      `Tag +${i + 1}: max ${day.tempMax}°C / min ${day.tempMin}°C, ` +
      `Wind ${day.windSpeedMax} km/h, Regen: ${day.precipitation > 0 ? 'ja' : 'nein'}`
    );
  }
}

function startUpdateCycle(intervalMinutes: number): void {
  if (updateTimer !== null) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  updateWeather().catch(console.error);
  updateTimer = setInterval(() => {
    updateWeather().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

// ── Configuration ─────────────────────────────────────────────────────────────

async function applyConfiguration(configuration: AddOn.Configuration): Promise<void> {
  const items = configuration['default']?.items ?? {};
  const city = items['city'] as string | undefined;
  const lat = items['latitude'] as number | undefined;
  const lon = items['longitude'] as number | undefined;
  const intervalMinutes = (items['updateInterval'] as number | undefined) ?? DEFAULT_UPDATE_INTERVAL_MIN;
  const newForecastDays = Math.min(
    Math.max(0, Math.trunc((items['forecastDays'] as number | undefined) ?? DEFAULT_FORECAST_DAYS)),
    MAX_FORECAST_DAYS
  );

  if (city) {
    const geo = await geocodeCity(city);
    if (!geo) {
      console.error(`Stadt "${city}" konnte nicht gefunden werden`);
      return;
    }
    currentLat = geo.lat;
    currentLon = geo.lon;
  } else if (lat !== undefined && lon !== undefined) {
    currentLat = lat;
    currentLon = lon;
    console.log(`Koordinaten gesetzt: ${lat}, ${lon}`);
  } else {
    console.log('Kein Standort konfiguriert. Bitte Stadt oder Koordinaten eingeben.');
    return;
  }

  await deactivateExcessForecastDevices(newForecastDays, activeForecastDays);
  activeForecastDays = newForecastDays;
  await ensureForecastDevices(activeForecastDays);
  startUpdateCycle(intervalMinutes);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  currentStation = await freeAtHome.createWeatherStationDevice('weather-station-001', 'Wetterstation');
  enableKeepAlive(currentStation);

  addOn.on('configurationChanged', (configuration: AddOn.Configuration) => {
    applyConfiguration(configuration).catch(console.error);
  });

  addOn.connectToConfiguration();
}

main().catch(console.error);
