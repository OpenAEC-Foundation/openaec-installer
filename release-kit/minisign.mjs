// Controle van minisign-handtekeningen zoals de Tauri-updater en de installer
// (`src-tauri/src/signature.rs`) ze maken en lezen. Geen extra pakketten: Node
// heeft Ed25519 en Blake2b-512 aan boord.
//
// Codering, gelijk aan Tauri: de publieke sleutel is base64 van het complete
// minisign-sleutelbestand, een handtekening (de inhoud van een `.sig`) base64 van
// het complete `.minisig`-bestand.
import { createHash, createPublicKey, verify } from "node:crypto";

const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

function lines(b64, what) {
  const text = Buffer.from(String(b64).trim(), "base64").toString("utf8");
  const out = text.split(/\r?\n/).filter((l) => l.length);
  if (out.length < 2) throw new Error(`${what}: geen minisign-bestand`);
  return out;
}

/** De sleutel-id en de Ed25519-sleutel uit een publieke sleutel (base64). */
export function publicKey(b64) {
  const raw = Buffer.from(lines(b64, "publieke sleutel")[1], "base64");
  if (raw.length !== 42 || raw.subarray(0, 2).toString() !== "Ed") throw new Error("publieke sleutel: onbekend formaat");
  return {
    keyId: raw.subarray(2, 10),
    key: createPublicKey({ key: Buffer.concat([SPKI_ED25519, raw.subarray(10)]), format: "der", type: "spki" }),
  };
}

/**
 * Controleer `data` (Buffer) tegen een handtekening (base64 van een `.minisig`).
 * Gooit een fout met de reden; geeft het vertrouwde commentaar terug.
 */
export function verifySignature(pubkeyB64, signatureB64, data) {
  const { keyId, key } = publicKey(pubkeyB64);
  const [, sigLine, trustedLine, globalLine] = lines(signatureB64, "handtekening");
  const sig = Buffer.from(sigLine ?? "", "base64");
  if (sig.length !== 74) throw new Error("handtekening: onbekend formaat");
  const algorithm = sig.subarray(0, 2).toString();
  if (!sig.subarray(2, 10).equals(keyId)) throw new Error("de handtekening hoort niet bij deze sleutel");
  // "ED": voorgehasht met Blake2b-512, zoals Tauri altijd doet; "Ed": het bestand zelf.
  const message = algorithm === "ED" ? createHash("blake2b512").update(data).digest() : algorithm === "Ed" ? data : null;
  if (!message) throw new Error(`handtekening: onbekend algoritme ${algorithm}`);
  if (!verify(null, message, key, sig.subarray(10))) throw new Error("handtekening klopt niet bij het bestand");
  if (!trustedLine?.startsWith("trusted comment: ") || !globalLine) throw new Error("handtekening: vertrouwd commentaar ontbreekt");
  const trusted = trustedLine.slice("trusted comment: ".length);
  const global = Buffer.from(globalLine, "base64");
  if (!verify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted, "utf8")]), key, global)) {
    throw new Error("vertrouwd commentaar is veranderd");
  }
  return trusted;
}
