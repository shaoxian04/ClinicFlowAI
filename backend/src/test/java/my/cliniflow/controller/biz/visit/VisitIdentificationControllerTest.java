package my.cliniflow.controller.biz.visit;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.visit.VisitIdentificationReadAppService;
import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.infrastructure.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class VisitIdentificationControllerTest {

    @Autowired MockMvc mvc;

    @MockBean VisitIdentificationReadAppService identificationReads;
    @MockBean PatientReadAppService patientReads;
    @MockBean VisitRepository visits;

    private static final UUID VISIT_ID   = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID DOCTOR_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000003");
    private static final UUID PATIENT_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000004");

    /** Build a mock Authentication with a JwtService.Claims principal — mirroring what JwtAuthenticationFilter does. */
    private static Authentication jwtAuth(UUID userId, Role role) {
        JwtService.Claims claims = new JwtService.Claims(userId, "test@example.com", role);
        return new UsernamePasswordAuthenticationToken(
                claims, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role.name())));
    }

    private VisitIdentificationInfo stubInfo() {
        return new VisitIdentificationInfo(
                new ClinicInfo("Test Clinic", "Jalan 1", "KL", "+60", "a@b.com", "REG-1"),
                new VisitIdentificationInfo.Patient("Tan Ah Kow", "880101-01-1234",
                        LocalDate.of(1988, 1, 1), 38, "MALE", "+60"),
                new VisitIdentificationInfo.Doctor("Dr. Lee", "MMC 001", "GP"),
                new VisitIdentificationInfo.Visit(VISIT_ID, PATIENT_ID, "V-001",
                        LocalDate.of(2026, 5, 2),
                        OffsetDateTime.parse("2026-05-02T11:00:00+08:00"))
        );
    }

    @Test
    void unauthenticated_is_rejected() throws Exception {
        mvc.perform(get("/api/visits/{visitId}/identification", VISIT_ID))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void doctor_role_receives_identification_block() throws Exception {
        when(identificationReads.assemble(VISIT_ID)).thenReturn(stubInfo());

        mvc.perform(get("/api/visits/{visitId}/identification", VISIT_ID)
                        .with(authentication(jwtAuth(DOCTOR_USER_ID, Role.DOCTOR))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.clinic.name").value("Test Clinic"))
                .andExpect(jsonPath("$.data.patient.nationalId").value("880101-01-1234"))
                .andExpect(jsonPath("$.data.doctor.fullName").value("Dr. Lee"))
                .andExpect(jsonPath("$.data.visit.referenceNumber").value("V-001"));
    }

    @Test
    void staff_role_can_call_endpoint() throws Exception {
        when(identificationReads.assemble(any())).thenReturn(stubInfo());
        mvc.perform(get("/api/visits/{visitId}/identification", VISIT_ID)
                        .with(authentication(jwtAuth(UUID.randomUUID(), Role.STAFF))))
                .andExpect(status().isOk());
    }

    @Test
    void admin_role_can_call_endpoint() throws Exception {
        when(identificationReads.assemble(any())).thenReturn(stubInfo());
        mvc.perform(get("/api/visits/{visitId}/identification", VISIT_ID)
                        .with(authentication(jwtAuth(UUID.randomUUID(), Role.ADMIN))))
                .andExpect(status().isOk());
    }

    @Test
    void patient_role_can_access_own_visit() throws Exception {
        when(identificationReads.assemble(VISIT_ID)).thenReturn(stubInfo());

        PatientModel ownPatient = new PatientModel();
        ownPatient.setId(PATIENT_ID);
        when(patientReads.findByUserId(PATIENT_USER_ID)).thenReturn(Optional.of(ownPatient));

        VisitModel visitModel = new VisitModel();
        visitModel.setPatientId(PATIENT_ID);
        when(visits.findById(VISIT_ID)).thenReturn(Optional.of(visitModel));

        mvc.perform(get("/api/visits/{visitId}/identification", VISIT_ID)
                        .with(authentication(jwtAuth(PATIENT_USER_ID, Role.PATIENT))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.patient.fullName").value("Tan Ah Kow"));
    }

    @Test
    void patient_role_is_forbidden_for_other_visits() throws Exception {
        PatientModel otherPatient = new PatientModel();
        otherPatient.setId(UUID.randomUUID()); // different — not the visit's patient
        when(patientReads.findByUserId(PATIENT_USER_ID)).thenReturn(Optional.of(otherPatient));

        VisitModel visitModel = new VisitModel();
        visitModel.setPatientId(PATIENT_ID);
        when(visits.findById(VISIT_ID)).thenReturn(Optional.of(visitModel));

        mvc.perform(get("/api/visits/{visitId}/identification", VISIT_ID)
                        .with(authentication(jwtAuth(PATIENT_USER_ID, Role.PATIENT))))
                .andExpect(status().isOk()) // WebResult wraps all as HTTP 200
                .andExpect(jsonPath("$.code").value(40300));
    }

    @Test
    void visit_not_found_returns_not_found_code() throws Exception {
        when(identificationReads.assemble(any()))
                .thenThrow(new ResourceNotFoundException("Visit", VISIT_ID));

        mvc.perform(get("/api/visits/{visitId}/identification", VISIT_ID)
                        .with(authentication(jwtAuth(DOCTOR_USER_ID, Role.DOCTOR))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40400));
    }
}
