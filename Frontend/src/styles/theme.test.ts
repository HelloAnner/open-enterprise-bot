import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "vitest";

const directory = new URL("./", import.meta.url);
const css = readFileSync(new URL("tokens.css", directory), "utf8");
const tokens = (source: string) => Object.fromEntries([...source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
const light = tokens(css.match(/^:root \{([\s\S]*?)^\}/m)![1]);
const dark = { ...light, ...tokens(css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]+)\}/)![1]) };

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("both system palettes keep text, controls and status colors readable", () => {
  for (const palette of [light, dark]) {
    for (const bg of ["--canvas", "--surface", "--sidebar", "--surface-subtle", "--surface-hover", "--surface-selected", "--bubble"]) {
      for (const fg of ["--ink", "--secondary", "--muted"]) {
        expect(contrast(palette[fg], palette[bg]), `${fg} on ${bg}: ${palette[bg]}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const fg of ["--link", "--danger", "--success", "--info"]) {
      expect(contrast(palette[fg], palette["--surface"]), fg).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(palette["--control-border"], palette["--surface"])).toBeGreaterThanOrEqual(3);
    expect(contrast(palette["--on-accent"], palette["--danger-fill"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette["--tooltip-ink"], palette["--tooltip-bg"])).toBeGreaterThanOrEqual(4.5);
  }
});

test("every component consumes theme tokens instead of fixed light-only colors", () => {
  const styles = readdirSync(directory).filter(name => name.endsWith(".css")).map(name => readFileSync(new URL(name, directory), "utf8")).join("\n");
  const available = new Set([...Object.keys(tokens(styles)), "--avatar", "--color"]);
  for (const match of styles.matchAll(/var\((--[\w-]+)/g)) expect(available.has(match[1]), match[1]).toBe(true);
  const rules = styles.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[\w-]+\s*:[^;]+;/g, "");
  expect(rules).not.toMatch(/#[a-f\d]{3,8}\b|(?<![\w-])(?:white|black)(?![\w-])|rgba?\(/i);
  expect(styles).not.toMatch(/filter:[^;]*(?:invert|hue-rotate)\(/);
  expect(css).toContain("color-scheme: light dark");
  expect(readFileSync(new URL("../app/App.tsx", directory), "utf8")).toContain('theme="system"');
  expect(readFileSync(new URL("../../index.html", directory), "utf8")).toContain('name="color-scheme" content="light dark"');
});
