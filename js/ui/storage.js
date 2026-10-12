// localStorage への保存。プライベートモード等で使えない場合は何もしない。

const RUN_KEY = "mcdb.run.v1";
const SETTINGS_KEY = "mcdb.settings.v1";
const STORY_KEY = "mcdb.story.v1";

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadRun() {
  return safe(() => {
    const raw = localStorage.getItem(RUN_KEY);
    return raw ? JSON.parse(raw) : null;
  });
}

export function saveRun(run) {
  safe(() => localStorage.setItem(RUN_KEY, JSON.stringify(run)));
}

export function clearRun() {
  safe(() => localStorage.removeItem(RUN_KEY));
}

export function loadStory() {
  return safe(() => {
    const raw = localStorage.getItem(STORY_KEY);
    return raw ? JSON.parse(raw) : null;
  });
}

export function saveStory(story) {
  safe(() => localStorage.setItem(STORY_KEY, JSON.stringify(story)));
}

export function loadSettings() {
  return safe(() => JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"), {}) || {};
}

export function saveSettings(settings) {
  safe(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)));
}
