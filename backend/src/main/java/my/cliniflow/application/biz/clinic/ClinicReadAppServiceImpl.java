package my.cliniflow.application.biz.clinic;

import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import my.cliniflow.infrastructure.config.ClinicProperties;
import org.springframework.stereotype.Service;

@Service
public class ClinicReadAppServiceImpl implements ClinicReadAppService {
    private final ClinicProperties props;

    public ClinicReadAppServiceImpl(ClinicProperties props) {
        this.props = props;
    }

    @Override
    public ClinicInfo get() {
        return new ClinicInfo(
                props.name(),
                props.addressLine1(),
                props.addressLine2(),
                props.phone(),
                props.email(),
                props.registrationNumber()
        );
    }
}
