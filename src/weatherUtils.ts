import { WeatherStationChannels } from '@busch-jaeger/free-at-home';

export const WEATHER_API_BASE = 'https://api.open-meteo.com/v1/forecast';
export const GEOCODING_API_BASE = 'https://geocoding-api.open-meteo.com/v1/search';

export interface CurrentWeather {
  temperature: number;
  windSpeed: number;
  precipitation: number;
  cloudCover: number;
  isDay: number;
}

export interface ForecastDay {
  tempMax: number;
  tempMin: number;
  precipitation: number;
  windSpeedMax: number;
  cloudCoverMean: number;
}

export async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
  const url = `${GEOCODING_API_BASE}?name=${encodeURIComponent(city)}&count=1&language=de`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json() as { results?: Array<{ latitude: number; longitude: number; name: string }> };
  if (!data.results || data.results.length === 0) return null;
  const result = data.results[0];
  console.log(`Stadt "${city}" gefunden: ${result.name} (${result.latitude}, ${result.longitude})`);
  return { lat: result.latitude, lon: result.longitude };
}

export async function fetchWeather(
  lat: number,
  lon: number,
  forecastDays: number
): Promise<{ current: CurrentWeather; forecast: ForecastDay[] } | null> {
  const params: Record<string, string> = {
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,precipitation,cloudcover,windspeed_10m,is_day',
    wind_speed_unit: 'ms',
    timezone: 'auto',
  };

  if (forecastDays > 0) {
    params['daily'] = 'temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,cloudcover_mean';
    // index 0 in daily = today; request +1 so we get tomorrow through day N
    params['forecast_days'] = String(forecastDays + 1);
  }

  const response = await fetch(`${WEATHER_API_BASE}?${new URLSearchParams(params)}`);
  if (!response.ok) return null;

  const data = await response.json() as {
    current: {
      temperature_2m: number;
      precipitation: number;
      cloudcover: number;
      windspeed_10m: number;
      is_day: number;
    };
    daily?: {
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      windspeed_10m_max: number[];
      cloudcover_mean: number[];
    };
  };

  const current: CurrentWeather = {
    temperature: data.current.temperature_2m,
    windSpeed: data.current.windspeed_10m,
    precipitation: data.current.precipitation,
    cloudCover: data.current.cloudcover,
    isDay: data.current.is_day,
  };

  const forecast: ForecastDay[] = [];
  if (forecastDays > 0 && data.daily) {
    for (let i = 1; i <= forecastDays; i++) {
      forecast.push({
        tempMax: data.daily.temperature_2m_max[i],
        tempMin: data.daily.temperature_2m_min[i],
        precipitation: data.daily.precipitation_sum[i],
        windSpeedMax: data.daily.windspeed_10m_max[i],
        cloudCoverMean: data.daily.cloudcover_mean[i],
      });
    }
  }

  return { current, forecast };
}

export function estimateBrightnessLux(cloudCover: number, isDay: number): number {
  if (isDay === 0) return 0;
  if (cloudCover < 25) return 50000;
  if (cloudCover < 75) return 20000;
  return 5000;
}

export function enableKeepAlive(station: WeatherStationChannels): void {
  station.brightness.setAutoKeepAlive(true);
  station.rain.setAutoKeepAlive(true);
  station.temperature.setAutoKeepAlive(true);
  station.wind.setAutoKeepAlive(true);
}

export async function markStationUnresponsive(station: WeatherStationChannels): Promise<void> {
  await Promise.all([
    station.brightness.setUnresponsive(),
    station.rain.setUnresponsive(),
    station.temperature.setUnresponsive(),
    station.wind.setUnresponsive(),
  ]);
}
