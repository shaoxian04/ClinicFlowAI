package my.cliniflow.infrastructure.crypto;

import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;

/**
 * AES-GCM 256 encryption for the NRIC plus HMAC-SHA256 fingerprint for dedupe lookup.
 * Ciphertext layout: [12-byte IV][ciphertext+tag]
 */
@Component
public class NationalIdEncryptor {

    private static final String AES_TRANSFORM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_LEN = 12;
    private static final SecureRandom RNG = new SecureRandom();

    private final KeyProvider keys;

    public NationalIdEncryptor(KeyProvider keys) { this.keys = keys; }

    public byte[] encrypt(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] iv = new byte[IV_LEN];
            RNG.nextBytes(iv);
            Cipher c = Cipher.getInstance(AES_TRANSFORM);
            c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keys.aesKey(), "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] ct = c.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.allocate(IV_LEN + ct.length).put(iv).put(ct).array();
        } catch (Exception e) {
            throw new IllegalStateException("nric encrypt failed", e);
        }
    }

    public String decrypt(byte[] envelope) {
        if (envelope == null) return null;
        try {
            ByteBuffer bb = ByteBuffer.wrap(envelope);
            byte[] iv = new byte[IV_LEN];
            bb.get(iv);
            byte[] ct = new byte[bb.remaining()];
            bb.get(ct);
            Cipher c = Cipher.getInstance(AES_TRANSFORM);
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keys.aesKey(), "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("nric decrypt failed", e);
        }
    }

    /** Hex-encoded HMAC-SHA256 fingerprint (64 chars). */
    public String fingerprint(String plaintext) {
        if (plaintext == null) return null;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(keys.hmacKey(), "HmacSHA256"));
            String normalized = plaintext.replaceAll("[^0-9A-Za-z]", "").toUpperCase();
            byte[] digest = mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException("nric fingerprint failed", e);
        }
    }
}
