package my.cliniflow.infrastructure.notification.whatsapp;

public interface WhatsAppSender {
    SendResult send(WhatsAppPayload payload);
}
