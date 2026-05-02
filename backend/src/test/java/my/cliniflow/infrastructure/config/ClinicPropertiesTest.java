package my.cliniflow.infrastructure.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.validation.BindValidationException;
import org.springframework.boot.context.properties.source.ConfigurationPropertyName;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class ClinicPropertiesTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(TestConfig.class);

    @org.springframework.boot.context.properties.EnableConfigurationProperties(ClinicProperties.class)
    static class TestConfig {}

    @Test
    void blank_name_blocks_startup() {
        runner.withPropertyValues(
                "cliniflow.clinic.name=",
                "cliniflow.clinic.address-line1=A",
                "cliniflow.clinic.address-line2=B",
                "cliniflow.clinic.phone=C",
                "cliniflow.clinic.email=d@e.f",
                "cliniflow.clinic.registration-number=R"
        ).run(ctx -> assertThat(ctx).hasFailed()
                .getFailure()
                .hasMessageContaining("name"));
    }

    @Test
    void all_fields_present_starts_up() {
        runner.withPropertyValues(
                "cliniflow.clinic.name=N",
                "cliniflow.clinic.address-line1=A",
                "cliniflow.clinic.address-line2=B",
                "cliniflow.clinic.phone=C",
                "cliniflow.clinic.email=d@e.f",
                "cliniflow.clinic.registration-number=R"
        ).run(ctx -> {
            assertThat(ctx).hasNotFailed();
            ClinicProperties cp = ctx.getBean(ClinicProperties.class);
            assertThat(cp.name()).isEqualTo("N");
            assertThat(cp.email()).isEqualTo("d@e.f");
        });
    }
}
