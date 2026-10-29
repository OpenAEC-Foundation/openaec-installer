//! Controle van de minisign-handtekening van een download, precies zoals de
//! Tauri-updater dat doet.
//!
//! Codering: de publieke sleutel (`pubkey` in de catalogus, gelijk aan
//! `plugins.updater.pubkey` in de `tauri.conf.json` van de tool) is base64 van
//! het complete minisign-sleutelbestand; de handtekening (uit `latest.json` of
//! het `.sig`-bestand naast het asset) is base64 van het complete
//! `.minisig`-bestand. Tauri ondertekent altijd "prehashed" (Blake2b-512),
//! zodat de controle tijdens het downloaden kan meelopen.

use base64::Engine;
use minisign_verify::{PublicKey, Signature, StreamVerifier};

pub struct Check {
    key: PublicKey,
    signature: Signature,
}

impl Check {
    pub fn new(pubkey: &str, signature: &str) -> Result<Self, String> {
        let key = PublicKey::decode(&decode(pubkey, "publieke sleutel")?)
            .map_err(|e| format!("publieke sleutel: {e}"))?;
        let signature = Signature::decode(&decode(signature, "handtekening")?)
            .map_err(|e| format!("handtekening: {e}"))?;
        Ok(Self { key, signature })
    }

    /// Start een controle die per blok gevoed wordt; `finalize` geeft het oordeel.
    pub fn verifier(&self) -> Result<StreamVerifier<'_>, String> {
        self.key.verify_stream(&self.signature).map_err(|e| match e {
            minisign_verify::Error::UnexpectedKeyId => {
                "de handtekening hoort niet bij de sleutel van deze tool".to_string()
            }
            other => format!("handtekening: {other}"),
        })
    }
}

fn decode(b64: &str, what: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|_| format!("{what}: geen geldige base64"))?;
    String::from_utf8(bytes).map_err(|_| format!("{what}: geen tekst"))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    // Eenmalig gemaakt met de minisign-crate; de geheime sleutel is weggegooid.
    pub const PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDQxNEI2N0M1MjNENUQ4NUMKUldSYzJOVWp4V2RMUWJMTHZzaHRDcEE1cHhRZldybmR5dXBjRGpmT1RNTS93NEFNTi9NajJFQUkK";
    pub const SIGNATURE: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSYzJOVWp4V2RMUWFuck1oUHFMc01rTGxySHhxRXloazIyTXFjZXpyRTVub2M0ODNIZjdXaS8xc29QczRXeU9SV09NRXA5c3hRc1V6VDNjN0xBcFlmb2tnQmJOaVZUemdVPQp0cnVzdGVkIGNvbW1lbnQ6IGZpbGU6dGVzdHBha2tldC5leGUKSTkvTkc0QnpCUEdWTjVKRWVITU5rWjlSclRuUmZVSVRpc1hQREhTa25MWFM0eVBrQTVFekNYNFAxNGxFbXZlSWR0Vk81M1FYaEtUWkhWWE9qOWZuQkE9PQo=";
    pub const SIGNED_DATA: &[u8] = b"OpenAEC Installer testpakket\n";
    const OTHER_PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEMwNzlCNEE5MUY1OTIzOTQKUldTVUkxa2ZxYlI1d0JCUXB1OHE0R242MVpIUm1rWjliZ3JNS2piT3VvQWwvQmc2VVQ4OUpSZDQK";

    fn verify_in_chunks(check: &Check, data: &[u8]) -> Result<(), String> {
        let mut v = check.verifier()?;
        for chunk in data.chunks(7) {
            v.update(chunk);
        }
        v.finalize().map_err(|e| e.to_string())
    }

    #[test]
    fn accepts_the_signed_data() {
        let check = Check::new(PUBKEY, SIGNATURE).unwrap();
        assert!(verify_in_chunks(&check, SIGNED_DATA).is_ok());
    }

    #[test]
    fn rejects_changed_data() {
        let check = Check::new(PUBKEY, SIGNATURE).unwrap();
        assert!(verify_in_chunks(&check, b"OpenAEC Installer testpakket!\n").is_err());
    }

    #[test]
    fn rejects_a_signature_from_another_key() {
        let check = Check::new(OTHER_PUBKEY, SIGNATURE).unwrap();
        let err = check.verifier().err().unwrap();
        assert!(err.contains("hoort niet bij de sleutel"), "{err}");
    }

    #[test]
    fn rejects_garbage() {
        assert!(Check::new("geen base64!", SIGNATURE).is_err());
        assert!(Check::new(PUBKEY, "aGFsbG8=").is_err());
    }
}
