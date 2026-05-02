package my.cliniflow.application.biz.visit;

import my.cliniflow.application.biz.clinic.ClinicReadAppService;
import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.user.model.DoctorProfileModel;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.DoctorProfileRepository;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VisitIdentificationReadAppServiceTest {

    @Mock VisitRepository visits;
    @Mock PatientReadAppService patients;
    @Mock UserRepository users;
    @Mock DoctorProfileRepository doctorProfiles;
    @Mock ClinicReadAppService clinic;

    @InjectMocks VisitIdentificationReadAppServiceImpl svc;

    /** Use reflection to set private JPA-managed fields on VisitModel. */
    private static void setVisitField(VisitModel v, String fieldName, Object value) throws Exception {
        Field f = VisitModel.class.getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(v, value);
    }

    @Test
    void assembles_full_block_for_finalized_visit() throws Exception {
        UUID visitId = UUID.randomUUID();
        UUID patId   = UUID.randomUUID();
        UUID docId   = UUID.randomUUID();

        VisitModel v = new VisitModel();
        setVisitField(v, "id", visitId);
        v.setPatientId(patId);
        v.setDoctorId(docId);
        v.setReferenceNumber("V-2026-05-02-0042");
        v.setFinalizedAt(OffsetDateTime.parse("2026-05-02T11:30:00+08:00"));
        setVisitField(v, "gmtCreate", OffsetDateTime.parse("2026-05-02T10:00:00+08:00"));

        PatientModel p = new PatientModel();
        p.setId(patId);
        p.setFullName("Tan Ah Kow");
        p.setDateOfBirth(LocalDate.parse("1988-01-01"));
        p.setGender("MALE");
        p.setPhone("+60 12-345 6789");

        UserModel u = new UserModel();
        u.setId(docId);
        u.setFullName("Lim Wei Jie");

        DoctorProfileModel dp = new DoctorProfileModel();
        dp.setUserId(docId);
        dp.setMmcNumber("MMC 54321");
        dp.setSpecialty("General Practice");

        when(visits.findById(visitId)).thenReturn(Optional.of(v));
        when(patients.findById(patId)).thenReturn(Optional.of(p));
        when(patients.decryptNationalId(p)).thenReturn("880101-01-1234");
        when(users.findById(docId)).thenReturn(Optional.of(u));
        when(doctorProfiles.findByUserId(docId)).thenReturn(Optional.of(dp));
        when(clinic.get()).thenReturn(new ClinicInfo("ClinicX", "Jalan 1", "KL", "+60 3-1111", "clinic@example.com", "REG-001"));

        VisitIdentificationInfo info = svc.assemble(visitId);

        assertThat(info.clinic().name()).isEqualTo("ClinicX");
        assertThat(info.patient().nationalId()).isEqualTo("880101-01-1234");
        assertThat(info.patient().ageYears()).isGreaterThanOrEqualTo(38);
        assertThat(info.doctor().fullName()).isEqualTo("Dr. Lim Wei Jie");
        assertThat(info.doctor().mmcNumber()).isEqualTo("MMC 54321");
        assertThat(info.doctor().specialty()).isEqualTo("General Practice");
        assertThat(info.visit().referenceNumber()).isEqualTo("V-2026-05-02-0042");
        assertThat(info.visit().visitId()).isEqualTo(visitId);
        assertThat(info.visit().patientId()).isEqualTo(patId);
    }

    @Test
    void does_not_double_prefix_dr_title() throws Exception {
        UUID visitId = UUID.randomUUID();
        UUID patId   = UUID.randomUUID();
        UUID docId   = UUID.randomUUID();

        VisitModel v = new VisitModel();
        setVisitField(v, "id", visitId);
        v.setPatientId(patId);
        v.setDoctorId(docId);
        v.setReferenceNumber("V-001");
        setVisitField(v, "gmtCreate", OffsetDateTime.parse("2026-05-02T10:00:00+08:00"));

        PatientModel p = new PatientModel();
        p.setId(patId);
        p.setFullName("Ahmad");
        p.setDateOfBirth(LocalDate.of(2000, 1, 1));
        p.setGender("MALE");
        p.setPhone("+60");

        UserModel u = new UserModel();
        u.setId(docId);
        u.setFullName("Dr. Ahmad Razif");

        DoctorProfileModel dp = new DoctorProfileModel();
        dp.setUserId(docId);
        dp.setMmcNumber("MMC 99");
        dp.setSpecialty("GP");

        when(visits.findById(visitId)).thenReturn(Optional.of(v));
        when(patients.findById(patId)).thenReturn(Optional.of(p));
        when(patients.decryptNationalId(p)).thenReturn(null);
        when(users.findById(docId)).thenReturn(Optional.of(u));
        when(doctorProfiles.findByUserId(docId)).thenReturn(Optional.of(dp));
        when(clinic.get()).thenReturn(new ClinicInfo("X", "Y", "Z", "P", "E", "R"));

        VisitIdentificationInfo info = svc.assemble(visitId);

        assertThat(info.doctor().fullName()).isEqualTo("Dr. Ahmad Razif");
    }

    @Test
    void throws_when_visit_not_found() {
        UUID id = UUID.randomUUID();
        when(visits.findById(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> svc.assemble(id)).isInstanceOf(ResourceNotFoundException.class);
    }
}
