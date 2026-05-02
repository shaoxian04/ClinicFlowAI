package my.cliniflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.reactive.ReactiveSecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.reactive.ReactiveUserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(exclude = {
    ReactiveSecurityAutoConfiguration.class,
    ReactiveUserDetailsServiceAutoConfiguration.class
})
@ConfigurationPropertiesScan("my.cliniflow.infrastructure.config")
@EnableScheduling
public class CliniflowApplication {

    public static void main(String[] args) {
        SpringApplication.run(CliniflowApplication.class, args);
    }
}
