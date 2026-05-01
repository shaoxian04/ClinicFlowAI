package my.cliniflow.infrastructure.audit;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AuditWriterTest {

    @Test
    void appendWithMetadataSerializesJsonb() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        AuditWriter w = new AuditWriter(jdbc);
        UUID actor = UUID.randomUUID();
        UUID resourceUuid = UUID.randomUUID();

        w.append("UPDATE", "USER_ROLE", resourceUuid.toString(), actor, "ADMIN",
                java.util.Map.of("from", "DOCTOR", "to", "ADMIN"));

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(anyString(), args.capture());
        Object[] vals = args.getValue();
        Object lastArg = vals[vals.length - 1];
        assertThat(lastArg.toString()).contains("\"from\":\"DOCTOR\"");
        assertThat(lastArg.toString()).contains("\"to\":\"ADMIN\"");
    }
}
