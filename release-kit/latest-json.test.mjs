// node --test "release-kit/*.test.mjs"  —  draait ook in de CI.
// Gebruikt de vaste testsleutel uit src-tauri/src/signature.rs (de geheime
// sleutel is weggegooid), zodat de kit hetzelfde formaat leest als de installer.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build, platformsFor, versionIn } from "./latest-json.mjs";
import { verifySignature } from "./minisign.mjs";

const PUBKEY = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDQxNEI2N0M1MjNENUQ4NUMKUldSYzJOVWp4V2RMUWJMTHZzaHRDcEE1cHhRZldybmR5dXBjRGpmT1RNTS93NEFNTi9NajJFQUkK";
const SIGNATURE = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSYzJOVWp4V2RMUWFuck1oUHFMc01rTGxySHhxRXloazIyTXFjZXpyRTVub2M0ODNIZjdXaS8xc29QczRXeU9SV09NRXA5c3hRc1V6VDNjN0xBcFlmb2tnQmJOaVZUemdVPQp0cnVzdGVkIGNvbW1lbnQ6IGZpbGU6dGVzdHBha2tldC5leGUKSTkvTkc0QnpCUEdWTjVKRWVITU5rWjlSclRuUmZVSVRpc1hQREhTa25MWFM0eVBrQTVFekNYNFAxNGxFbXZlSWR0Vk81M1FYaEtUWkhWWE9qOWZuQkE9PQo=";
const OTHER_PUBKEY = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEMwNzlCNEE5MUY1OTIzOTQKUldTVUkxa2ZxYlI1d0JCUXB1OHE0R242MVpIUm1rWjliZ3JNS2piT3VvQWwvQmc2VVQ4OUpSZDQK";
const DATA = Buffer.from("OpenAEC Installer testpakket\n");

test("leest Tauri-handtekeningen zoals de installer", () => {
  assert.equal(verifySignature(PUBKEY, SIGNATURE, DATA), "file:testpakket.exe");
  assert.throws(() => verifySignature(PUBKEY, SIGNATURE, Buffer.from("anders")), /klopt niet/);
  assert.throws(() => verifySignature(OTHER_PUBKEY, SIGNATURE, DATA), /hoort niet bij deze sleutel/);
});

test("kent de platformsleutels van de installer", () => {
  assert.deepEqual(platformsFor("Open.Calc.Studio_2026.44.1_x64-setup.exe"), ["windows-x86_64-nsis", "windows-x86_64"]);
  assert.deepEqual(platformsFor("Open.Calc.Studio_2026.44.1_x64_en-US.msi"), ["windows-x86_64-msi"]);
  assert.deepEqual(platformsFor("app_2026.44.1_amd64.AppImage"), ["linux-x86_64-appimage", "linux-x86_64"]);
  assert.equal(platformsFor("app_2026.44.1_x64-user-setup.exe"), null);
  assert.equal(platformsFor("app_2026.44.1_amd64.deb"), null);
  assert.equal(platformsFor("app_2026.44.1_x64-setup.exe.sig"), null);
});

test("leest de versie uit tauri.conf.json en Cargo.toml", () => {
  const dir = release({
    "a.toml": '[package]\nname = "x"\nversion = "1.2.3"\n',
    "b.toml": '[workspace]\nmembers = []\n\n[workspace.package]\nversion = "2026.44.1"\n',
    "c.json": '{"version":"0.13.0"}',
  });
  try {
    assert.equal(versionIn(join(dir, "a.toml")), "1.2.3");
    assert.equal(versionIn(join(dir, "b.toml")), "2026.44.1");
    assert.equal(versionIn(join(dir, "c.json")), "0.13.0");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

function release(files) {
  const dir = mkdtempSync(join(tmpdir(), "kit-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

test("maakt latest.json alleen met kloppende handtekeningen", () => {
  const sig = Buffer.from(SIGNATURE, "base64").toString("utf8");
  const ok = release({ "app_1.2.3_x64-setup.exe": DATA, "app_1.2.3_x64-setup.exe.sig": SIGNATURE, "app_1.2.3_amd64.deb": "x", "tauri.conf.json": '{"version":"1.2.3"}' });
  try {
    const { manifest, checked } = build({ repo: "a/b", tag: "v1.2.3", dir: ok, pubkey: PUBKEY, versionFile: join(ok, "tauri.conf.json"), now: new Date("2026-10-29T20:00:00Z") });
    assert.deepEqual(checked, ["app_1.2.3_x64-setup.exe"]);
    assert.equal(manifest.version, "1.2.3");
    assert.equal(manifest.pub_date, "2026-10-29T20:00:00Z");
    assert.equal(manifest.platforms["windows-x86_64-nsis"].url, "https://github.com/a/b/releases/download/v1.2.3/app_1.2.3_x64-setup.exe");
    assert.equal(Buffer.from(manifest.platforms["windows-x86_64"].signature, "base64").toString("utf8"), sig);
    assert.throws(() => build({ repo: "a/b", tag: "v1.2.4", dir: ok, pubkey: PUBKEY, versionFile: join(ok, "tauri.conf.json") }), /zegt 1\.2\.3/);
    assert.throws(() => build({ repo: "a/b", tag: "v1.2.3", dir: ok, pubkey: OTHER_PUBKEY }), /hoort niet bij deze sleutel/);
  } finally {
    rmSync(ok, { recursive: true });
  }
  const bad = release({ "app_1.2.3_x64-setup.exe": "veranderd", "app_1.2.3_x64-setup.exe.sig": SIGNATURE });
  const unsigned = release({ "app_1.2.3_x64-setup.exe": DATA });
  const empty = release({ "app_1.2.3_amd64.deb": "x" });
  try {
    assert.throws(() => build({ repo: "a/b", tag: "v1.2.3", dir: bad, pubkey: PUBKEY }), /klopt niet/);
    assert.throws(() => build({ repo: "a/b", tag: "v1.2.3", dir: unsigned, pubkey: PUBKEY }), /geen \.sig/);
    assert.throws(() => build({ repo: "a/b", tag: "v1.2.3", dir: empty, pubkey: PUBKEY }), /geen ondertekende setup/);
  } finally {
    for (const d of [bad, unsigned, empty]) rmSync(d, { recursive: true });
  }
});
