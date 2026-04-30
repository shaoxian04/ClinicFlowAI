package my.cliniflow.infrastructure.crypto;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;

/**
 * Provides keys for app-layer encryption. Sources:
 *  - cliniflow.crypto.aes-key  — base64-encoded 32-byte AES-256 key
 *  - cliniflow.crypto.hmac-key — base64-encoded HMAC-SHA256 key (≥32 bytes)
 *
 * Defaults are dev-only — production must set via env / secret manager.
 */
@Component
public class KeyProvider {

    private final byte[] aesKey;
    private final byte[] hmacKey;

    public KeyProvider(
            @Value("${cliniflow.crypto.aes-key:ZGV2LWFlcy1rZXktY2hhbmdlLW1lLTMyLWJ5dGUtbm9wZS0xMTE=}") String aesKeyB64,
            @Value("${cliniflow.crypto.hmac-key:ZGV2LWhtYWMta2V5LWNoYW5nZS1tZS1taW4tMzItYnl0ZXMtMjIyMjIyMjIy}") String hmacKeyB64) {
        this.aesKey = decodeOrPad(aesKeyB64, 32);
        this.hmacKey = decodeOrPad(hmacKeyB64, 32);
    }

    private static byte[] decodeOrPad(String b64, int minBytes) {
        try {
            byte[] decoded = Base64.getDecoder().decode(b64);
            if (decoded.length < minBytes) {
                byte[] padded = Arrays.copyOf(decoded, minBytes);
                System.arraycopy(b64.getBytes(StandardCharsets.UTF_8), 0, padded, 0,
                        Math.min(b64.length(), minBytes));
                return padded;
            }
            return Arrays.copyOf(decoded, minBytes);
        } catch (IllegalArgumentException e) {
            byte[] raw = b64.getBytes(StandardCharsets.UTF_8);
            return Arrays.copyOf(raw, minBytes);
        }
    }

    public byte[] aesKey() { return aesKey.clone(); }
    public byte[] hmacKey() { return hmacKey.clone(); }
}
