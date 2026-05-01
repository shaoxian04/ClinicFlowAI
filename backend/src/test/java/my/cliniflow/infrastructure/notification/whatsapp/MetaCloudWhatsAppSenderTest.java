package my.cliniflow.infrastructure.notification.whatsapp;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import my.cliniflow.infrastructure.notification.template.MessageTemplateRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests {@link MetaCloudWhatsAppSender} against an in-process JDK {@link HttpServer}
 * acting as a fake Graph API. Avoids the WireMock/Jetty version conflict with
 * Spring Boot 3.3.
 */
class MetaCloudWhatsAppSenderTest {

    private static final Map<String, String> ROUTES = Map.of(
        "appointment_confirmation_v1", "cliniflow_appointment_confirmation_v1",
        "appointment_cancelled_v1",    "cliniflow_appointment_cancelled_v1",
        "soap_meds_summary_v1",        "cliniflow_soap_meds_summary_v1",
        "soap_followup_reminder_v1",   "cliniflow_soap_followup_reminder_v1"
    );

    private static final Map<String, String> LANGUAGES = Map.of(
        "en", "en_US",
        "ms", "ms",
        "zh", "zh_CN"
    );

    private HttpServer server;
    private MetaCloudWhatsAppSender sender;
    private final AtomicReference<String> lastRequestBody = new AtomicReference<>();
    private volatile int responseStatus;
    private volatile String responseBody;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v21.0/1037199759485573/messages", this::handle);
        server.start();

        sender = newSender(ROUTES, LANGUAGES);
        int port = server.getAddress().getPort();
        sender.setClientForTest(WebClient.builder()
            .baseUrl("http://127.0.0.1:" + port + "/v21.0")
            .defaultHeader("Authorization", "Bearer test-token")
            .defaultHeader("Content-Type", "application/json")
            .build());
    }

    private MetaCloudWhatsAppSender newSender(Map<String, String> routes, Map<String, String> langs) {
        MetaCloudWhatsAppSender s = new MetaCloudWhatsAppSender(
            "1037199759485573",
            "test-token",
            "v21.0",
            "hello_world",
            "en_US",
            routes,
            langs,
            new MessageTemplateRegistry());
        s.init();
        return s;
    }

    @AfterEach
    void tearDown() {
        if (server != null) server.stop(0);
    }

    private void handle(HttpExchange ex) throws IOException {
        byte[] reqBytes = ex.getRequestBody().readAllBytes();
        lastRequestBody.set(new String(reqBytes, StandardCharsets.UTF_8));
        byte[] body = (responseBody == null ? "" : responseBody).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(responseStatus, body.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(body);
        }
    }

    private void respond(int status, String body) {
        this.responseStatus = status;
        this.responseBody = body;
    }

    @Test
    void send_success_returnsSentWithMessageId() {
        respond(200, "{\"messaging_product\":\"whatsapp\",\"messages\":[{\"id\":\"wamid.ABC123\"}]}");

        SendResult result = sender.send(payload("+60122372812"));

        assertThat(result).isInstanceOf(SendResult.Sent.class);
        assertThat(((SendResult.Sent) result).twilioSid()).isEqualTo("wamid.ABC123");
    }

    @Test
    void send_routesBookingTemplate_withFourBodyParams() {
        respond(200, "{\"messages\":[{\"id\":\"wamid.X\"}]}");

        sender.send(payload("+60122372812"));

        String body = lastRequestBody.get();
        assertThat(body).contains("\"to\":\"60122372812\"");
        assertThat(body).contains("\"name\":\"cliniflow_appointment_confirmation_v1\"");
        assertThat(body).contains("\"code\":\"en_US\"");
        // 4 body parameters with our values, in order
        assertThat(body).contains("\"text\":\"Pat Demo\"");
        assertThat(body).contains("\"text\":\"Smith\"");
        assertThat(body).contains("\"text\":\"5 May\"");
        assertThat(body).contains("\"text\":\"10:30\"");
        assertThat(body).contains("\"type\":\"body\"");
    }

    @Test
    void send_routesCancelTemplate_withThreeBodyParams() {
        respond(200, "{\"messages\":[{\"id\":\"wamid.X\"}]}");

        sender.send(new WhatsAppPayload(
            "+60122372812",
            "appointment_cancelled_v1",
            "en",
            Map.of("patientName", "Pat", "doctorName", "Smith", "date", "5 May")));

        String body = lastRequestBody.get();
        assertThat(body).contains("\"name\":\"cliniflow_appointment_cancelled_v1\"");
        assertThat(body).contains("\"text\":\"Pat\"");
        assertThat(body).contains("\"text\":\"Smith\"");
        assertThat(body).contains("\"text\":\"5 May\"");
    }

    @Test
    void send_routesMedsSummaryTemplate_withThreeBodyParams() {
        respond(200, "{\"messages\":[{\"id\":\"wamid.X\"}]}");

        sender.send(new WhatsAppPayload(
            "+60122372812",
            "soap_meds_summary_v1",
            "en",
            Map.of("patientName", "Pat", "date", "30 Apr", "medsSummary", "amox 500mg x3/day")));

        String body = lastRequestBody.get();
        assertThat(body).contains("\"name\":\"cliniflow_soap_meds_summary_v1\"");
        assertThat(body).contains("\"text\":\"amox 500mg x3/day\"");
    }

    @Test
    void send_routesFollowupReminder_withFourBodyParams() {
        respond(200, "{\"messages\":[{\"id\":\"wamid.X\"}]}");

        sender.send(new WhatsAppPayload(
            "+60122372812",
            "soap_followup_reminder_v1",
            "en",
            Map.of("patientName", "Pat", "doctorName", "Smith", "date", "12 May", "time", "2pm")));

        String body = lastRequestBody.get();
        assertThat(body).contains("\"name\":\"cliniflow_soap_followup_reminder_v1\"");
        assertThat(body).contains("\"text\":\"2pm\"");
    }

    @Test
    void send_unmappedTemplateId_fallsBackToHelloWorld_noComponents() {
        sender = newSender(Map.of(), LANGUAGES); // empty routing
        int port = server.getAddress().getPort();
        sender.setClientForTest(WebClient.builder()
            .baseUrl("http://127.0.0.1:" + port + "/v21.0")
            .defaultHeader("Authorization", "Bearer test-token")
            .defaultHeader("Content-Type", "application/json")
            .build());

        respond(200, "{\"messages\":[{\"id\":\"wamid.X\"}]}");

        sender.send(payload("+60122372812"));

        String body = lastRequestBody.get();
        assertThat(body).contains("\"name\":\"hello_world\"");
        assertThat(body).doesNotContain("\"components\"");
    }

    @Test
    void send_localeMapping_zhMapsToZhCN() {
        respond(200, "{\"messages\":[{\"id\":\"wamid.X\"}]}");

        sender.send(new WhatsAppPayload(
            "+60122372812",
            "appointment_confirmation_v1",
            "zh",
            Map.of("patientName", "X", "doctorName", "Y", "date", "5/5", "time", "10:30")));

        String body = lastRequestBody.get();
        assertThat(body).contains("\"code\":\"zh_CN\"");
    }

    @Test
    void send_localeMapping_msMapsToMs() {
        respond(200, "{\"messages\":[{\"id\":\"wamid.X\"}]}");

        sender.send(new WhatsAppPayload(
            "+60122372812",
            "appointment_confirmation_v1",
            "ms",
            Map.of("patientName", "X", "doctorName", "Y", "date", "5/5", "time", "10:30")));

        String body = lastRequestBody.get();
        assertThat(body).contains("\"code\":\"ms\"");
    }

    @Test
    void send_unknownLocale_fallsBackToDefault() {
        respond(200, "{\"messages\":[{\"id\":\"wamid.X\"}]}");

        sender.send(new WhatsAppPayload(
            "+60122372812",
            "appointment_confirmation_v1",
            "fr",
            Map.of("patientName", "X", "doctorName", "Y", "date", "5/5", "time", "10:30")));

        String body = lastRequestBody.get();
        assertThat(body).contains("\"code\":\"en_US\"");
    }

    @Test
    void send_stripsLeadingPlusFromTo() {
        respond(200, "{\"messages\":[{\"id\":\"wamid.X\"}]}");

        sender.send(payload("+60122372812"));

        String body = lastRequestBody.get();
        assertThat(body).contains("\"to\":\"60122372812\"");
        assertThat(body).contains("\"messaging_product\":\"whatsapp\"");
    }

    @Test
    void send_terminalErrorCode_returnsTerminal() {
        respond(400, "{\"error\":{\"message\":\"Template does not exist\","
            + "\"type\":\"OAuthException\",\"code\":132001,\"fbtrace_id\":\"X\"}}");

        SendResult result = sender.send(payload("+60122372812"));

        assertThat(result).isInstanceOf(SendResult.Terminal.class);
        assertThat(((SendResult.Terminal) result).code()).isEqualTo("132001");
    }

    @Test
    void send_unknown4xx_returnsTerminal() {
        respond(400, "{\"error\":{\"code\":999999}}");

        SendResult result = sender.send(payload("+60122372812"));

        assertThat(result).isInstanceOf(SendResult.Terminal.class);
    }

    @Test
    void send_5xx_returnsRetryable() {
        respond(503, "{\"error\":{\"code\":131000}}");

        SendResult result = sender.send(payload("+60122372812"));

        assertThat(result).isInstanceOf(SendResult.Retryable.class);
    }

    @Test
    void send_transportError_returnsRetryable() {
        server.stop(0);  // force connection refused
        server = null;

        SendResult result = sender.send(payload("+60122372812"));

        assertThat(result).isInstanceOf(SendResult.Retryable.class);
    }

    private static WhatsAppPayload payload(String phone) {
        return new WhatsAppPayload(
            phone,
            "appointment_confirmation_v1",
            "en",
            Map.of(
                "patientName", "Pat Demo",
                "doctorName", "Smith",
                "date", "5 May",
                "time", "10:30"));
    }
}
