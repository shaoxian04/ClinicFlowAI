package my.cliniflow.infrastructure.notification.whatsapp;

public sealed interface SendResult
    permits SendResult.Sent, SendResult.Retryable, SendResult.Terminal {

    record Sent(String twilioSid) implements SendResult {}
    record Retryable(String error) implements SendResult {}
    record Terminal(String error, String code) implements SendResult {}
}
