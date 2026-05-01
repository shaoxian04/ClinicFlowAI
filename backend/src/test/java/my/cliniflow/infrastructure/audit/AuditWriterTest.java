package my.cliniflow.infrastructure.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AuditWriterTest {

    @Test
    void appendWithMetadataSerializesJsonb() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        AuditWriter w = new AuditWriter(jdbc, new ObjectMapper());
        UUID actor = UUID.randomUUID();
        UUID resourceUuid = UUID.randomUUID();

        w.append("UPDATE", "USER_ROLE", resourceUuid.toString(), actor, "ADMIN",
                java.util.Map.of("from", "DOCTOR", "to", "ADMIN"));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(sql.capture(), args.capture());

        assertThat(sql.getValue()).contains("metadata").contains("?::jsonb");

        Object[] vals = args.getValue();
        // SQL VALUES order: occurred_at, actor_user_id, actor_role, action, resource_type, resource_id, metadata
        assertThat(vals[1]).isEqualTo(actor);
        assertThat(vals[2]).isEqualTo("ADMIN");
        assertThat(vals[3]).isEqualTo("UPDATE");
        assertThat(vals[4]).isEqualTo("USER_ROLE");
        assertThat(vals[5]).isEqualTo(resourceUuid.toString());
        assertThat(vals[6].toString())
            .contains("\"from\":\"DOCTOR\"")
            .contains("\"to\":\"ADMIN\"");
    }
}
