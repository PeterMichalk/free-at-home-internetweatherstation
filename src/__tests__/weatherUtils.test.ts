import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  estimateBrightnessLux,
  geocodeCity,
  fetchWeather,
  enableKeepAlive,
  markStationUnresponsive,
} from '../weatherUtils.js';
import type { WeatherStationChannels } from '@busch-jaeger/free-at-home';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockChannel() {
  return {
    setAutoKeepAlive: vi.fn(),
    setUnresponsive: vi.fn().mockResolvedValue(undefined),
    setTemperature: vi.fn(),
    setWindSpeed: vi.fn(),
    setIsRaining: vi.fn(),
    setBrightnessLevel: vi.fn(),
  };
}

function makeMockStation(): WeatherStationChannels {
  return {
    temperature: makeMockChannel() as any,
    wind: makeMockChannel() as any,
    rain: makeMockChannel() as any,
    brightness: makeMockChannel() as any,
  };
}

function mockFetch(response: object, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => response,
  }) as any;
}

// ── estimateBrightnessLux ─────────────────────────────────────────────────────

describe('estimateBrightnessLux', () => {
  it('returns 0 at night regardless of cloud cover', () => {
    expect(estimateBrightnessLux(0, 0)).toBe(0);
    expect(estimateBrightnessLux(100, 0)).toBe(0);
  });

  it('returns 50 000 lux for a clear sky during the day (< 25 % clouds)', () => {
    expect(estimateBrightnessLux(0, 1)).toBe(50000);
    expect(estimateBrightnessLux(24, 1)).toBe(50000);
  });

  it('returns 20 000 lux for partly cloudy during the day (25–74 % clouds)', () => {
    expect(estimateBrightnessLux(25, 1)).toBe(20000);
    expect(estimateBrightnessLux(74, 1)).toBe(20000);
  });

  it('returns 5 000 lux for overcast during the day (≥ 75 % clouds)', () => {
    expect(estimateBrightnessLux(75, 1)).toBe(5000);
    expect(estimateBrightnessLux(100, 1)).toBe(5000);
  });
});

// ── geocodeCity ───────────────────────────────────────────────────────────────

describe('geocodeCity', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns coordinates for a known city', async () => {
    mockFetch({ results: [{ latitude: 52.52, longitude: 13.405, name: 'Berlin' }] });
    const result = await geocodeCity('Berlin');
    expect(result).toEqual({ lat: 52.52, lon: 13.405 });
  });

  it('returns null when no results are found', async () => {
    mockFetch({ results: [] });
    expect(await geocodeCity('UnbekanntXYZ')).toBeNull();
  });

  it('returns null when results key is missing', async () => {
    mockFetch({});
    expect(await geocodeCity('Berlin')).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    mockFetch({}, false);
    expect(await geocodeCity('Berlin')).toBeNull();
  });

  it('encodes special characters in the city name', async () => {
    mockFetch({ results: [{ latitude: 48.14, longitude: 11.58, name: 'München' }] });
    await geocodeCity('München');
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('M%C3%BCnchen');
  });
});

// ── fetchWeather ──────────────────────────────────────────────────────────────

const CURRENT_PAYLOAD = {
  temperature_2m: 18.5,
  precipitation: 0,
  cloudcover: 20,
  windspeed_10m: 12.3,
  is_day: 1,
};

const DAILY_PAYLOAD = {
  temperature_2m_max: [20, 22, 19, 17, 21, 23],
  temperature_2m_min: [12, 14, 11, 9, 13, 15],
  precipitation_sum: [0, 2.5, 0, 0, 1.0, 0],
  windspeed_10m_max: [15, 20, 10, 8, 18, 12],
  cloudcover_mean: [30, 80, 10, 5, 60, 20],
};

describe('fetchWeather', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('maps current weather fields correctly', async () => {
    mockFetch({ current: CURRENT_PAYLOAD });
    const result = await fetchWeather(52.52, 13.405, 0);
    expect(result).not.toBeNull();
    expect(result!.current).toEqual({
      temperature: 18.5,
      windSpeed: 12.3,
      precipitation: 0,
      cloudCover: 20,
      isDay: 1,
    });
  });

  it('returns an empty forecast array when forecastDays is 0', async () => {
    mockFetch({ current: CURRENT_PAYLOAD });
    const result = await fetchWeather(52.52, 13.405, 0);
    expect(result!.forecast).toHaveLength(0);
  });

  it('does not include daily params in the URL when forecastDays is 0', async () => {
    mockFetch({ current: CURRENT_PAYLOAD });
    await fetchWeather(52.52, 13.405, 0);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain('daily');
  });

  it('requests wind speed in m/s', async () => {
    mockFetch({ current: CURRENT_PAYLOAD });
    await fetchWeather(52.52, 13.405, 0);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('wind_speed_unit=ms');
  });

  it('returns the correct number of forecast days', async () => {
    mockFetch({ current: CURRENT_PAYLOAD, daily: DAILY_PAYLOAD });
    const result = await fetchWeather(52.52, 13.405, 3);
    expect(result!.forecast).toHaveLength(3);
  });

  it('skips index 0 (today) in daily data', async () => {
    mockFetch({ current: CURRENT_PAYLOAD, daily: DAILY_PAYLOAD });
    const result = await fetchWeather(52.52, 13.405, 2);
    // daily index 1 = tomorrow
    expect(result!.forecast[0].tempMax).toBe(22);
    expect(result!.forecast[0].precipitation).toBe(2.5);
    // daily index 2 = day after tomorrow
    expect(result!.forecast[1].tempMax).toBe(19);
  });

  it('maps all forecast fields correctly', async () => {
    mockFetch({ current: CURRENT_PAYLOAD, daily: DAILY_PAYLOAD });
    const result = await fetchWeather(52.52, 13.405, 1);
    expect(result!.forecast[0]).toEqual({
      tempMax: 22,
      tempMin: 14,
      precipitation: 2.5,
      windSpeedMax: 20,
      cloudCoverMean: 80,
    });
  });

  it('requests forecast_days as forecastDays + 1', async () => {
    mockFetch({ current: CURRENT_PAYLOAD, daily: DAILY_PAYLOAD });
    await fetchWeather(52.52, 13.405, 3);
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('forecast_days=4');
  });

  it('returns null on HTTP error', async () => {
    mockFetch({}, false);
    expect(await fetchWeather(52.52, 13.405, 0)).toBeNull();
  });
});

// ── enableKeepAlive ───────────────────────────────────────────────────────────

describe('enableKeepAlive', () => {
  it('calls setAutoKeepAlive(true) on all four channels', () => {
    const station = makeMockStation();
    enableKeepAlive(station);
    for (const ch of [station.temperature, station.wind, station.rain, station.brightness]) {
      expect((ch as any).setAutoKeepAlive).toHaveBeenCalledWith(true);
    }
  });
});

// ── markStationUnresponsive ───────────────────────────────────────────────────

describe('markStationUnresponsive', () => {
  it('calls setUnresponsive on all four channels', async () => {
    const station = makeMockStation();
    await markStationUnresponsive(station);
    for (const ch of [station.temperature, station.wind, station.rain, station.brightness]) {
      expect((ch as any).setUnresponsive).toHaveBeenCalledOnce();
    }
  });

  it('runs all four setUnresponsive calls in parallel', async () => {
    const order: string[] = [];
    const station = makeMockStation();

    for (const [key, ch] of Object.entries(station)) {
      (ch as any).setUnresponsive = vi.fn().mockImplementation(async () => {
        order.push(key);
      });
    }

    await markStationUnresponsive(station);
    expect(order).toHaveLength(4);
  });
});
